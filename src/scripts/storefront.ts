import { business } from '../data/business';
import { flavours } from '../data/flavours';
import type { OrderRequestDetails, OrderSelection } from '../lib/types';
import { calculateSubtotal, canSelectFlavour, formatPrice, MAX_QUANTITY, orderLines, setQuantity, volumeLabel } from '../lib/order';
import { getFlavourPresentation } from '../lib/flavour-presentation';
import { buildOrderMessage, buildWhatsAppUrl, canSendRequest, validateOrderRequestDetails } from '../lib/whatsapp';
import { buildAuditPayload, createRequestId, sendAudit } from '../lib/order-audit';
import { initFlavourCards } from './flavour-cards';

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing storefront element: ${selector}`);
  return node;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Narrow phones collapse the main navigation into a disclosure menu; wider layouts ignore this state.
function initNavMenu() {
  const header = document.querySelector<HTMLElement>('.site-header');
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const nav = document.querySelector<HTMLElement>('#site-nav');
  if (!header || !toggle || !nav) return;
  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    header.toggleAttribute('data-nav-open', open);
  };
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  toggle.addEventListener('click', () => setOpen(!isOpen()));
  nav.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (isOpen() && event.target instanceof Node && !toggle.contains(event.target) && !nav.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    toggle.focus();
  });
}

function initStorefront() {
  const dialog = required<HTMLDialogElement>('#order-dialog');
  const lineContainer = required<HTMLElement>('[data-order-lines]');
  const messageField = required<HTMLTextAreaElement>('#order-message');
  const toast = required<HTMLElement>('[data-toast]');
  const status = required<HTMLElement>('[data-drawer-status]');
  const sendLink = required<HTMLAnchorElement>('[data-whatsapp]');
  const disabledSend = required<HTMLButtonElement>('[data-send-disabled]');
  const detailsError = required<HTMLElement>('[data-request-details-error]');
  const deliveryArea = required<HTMLElement>('[data-delivery-area]');
  const detailFields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-request-field]'));
  let selection: OrderSelection = {};
  let opener: HTMLElement | null = null;
  let toastTimer: ReturnType<typeof setTimeout>;

  function requestDetails(): OrderRequestDetails {
    const value = (field: string) => required<HTMLInputElement | HTMLSelectElement>(`[data-request-field="${field}"]`).value;
    return {
      customerName: value('customerName'),
      preferredDate: value('preferredDate'),
      preferredTime: value('preferredTime'),
      fulfilment: value('fulfilment') as OrderRequestDetails['fulfilment'],
      deliveryArea: value('deliveryArea'),
      paymentMethod: value('paymentMethod') as OrderRequestDetails['paymentMethod'],
    };
  }

  function clearRequestDetails() {
    detailFields.forEach((field) => {
      if (field.dataset.requestField === 'fulfilment') field.value = 'pickup';
      else field.value = '';
    });
  }

  const announce = (text: string) => {
    toast.textContent = text;
    toast.dataset.visible = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { delete toast.dataset.visible; }, 3200);
  };

  function render() {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focusKey : undefined;
    const lines = orderLines(selection, flavours);
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    document.querySelectorAll('[data-count]').forEach((node) => { node.textContent = String(count); });
    document.body.classList.toggle('has-cups', count > 0);
    required<HTMLElement>('[data-mobile-bag]').hidden = count === 0;
    required<HTMLElement>('[data-empty-order]').hidden = count > 0;
    required<HTMLElement>('[data-order-summary]').hidden = count === 0;
    document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((button) => {
      const id = button.dataset.add!;
      button.disabled = !canSelectFlavour(flavours.find((item) => item.id === id)) || (selection[id] ?? 0) >= MAX_QUANTITY;
    });

    const fragment = document.createDocumentFragment();
    for (const { flavour, quantity } of lines) {
      const row = element('div', 'order-line');
      row.dataset.line = flavour.id;
      const image = element('img', '');
      image.src = flavour.illustration;
      image.alt = ''; // The adjacent heading identifies the flavour.
      image.width = 75;
      image.height = 75;
      const info = element('div', 'line-info');
      const controls = element('div', 'line-controls');
      const decrease = element('button', 'quantity-button', '−');
      decrease.setAttribute('aria-label', `Decrease ${flavour.name}`);
      decrease.dataset.focusKey = `${flavour.id}-minus`;
      decrease.addEventListener('click', () => changeQuantity(flavour.id, quantity - 1));
      const input = element('input', 'quantity-input');
      input.type = 'number';
      input.min = '0';
      input.max = String(MAX_QUANTITY);
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = String(quantity);
      input.setAttribute('aria-label', `Quantity for ${flavour.name}`);
      input.dataset.focusKey = `${flavour.id}-quantity`;
      input.addEventListener('change', () => changeQuantity(flavour.id, input.value === '' ? NaN : input.valueAsNumber));
      const increase = element('button', 'quantity-button', '+');
      increase.setAttribute('aria-label', `Increase ${flavour.name}`);
      increase.dataset.focusKey = `${flavour.id}-plus`;
      increase.disabled = quantity >= MAX_QUANTITY;
      increase.addEventListener('click', () => changeQuantity(flavour.id, quantity + 1));
      const remove = element('button', 'remove-line', 'Remove');
      remove.setAttribute('aria-label', `Remove ${flavour.name}`);
      remove.dataset.focusKey = `${flavour.id}-remove`;
      remove.addEventListener('click', () => changeQuantity(flavour.id, 0));
      controls.append(decrease, input, increase, remove);
      info.append(element('h3', '', flavour.name), element('p', '', `${volumeLabel(flavour)} · ${formatPrice(flavour.priceMinor, business.currency)}`), controls);
      row.append(image, info);
      fragment.append(row);
    }
    lineContainer.replaceChildren(fragment);
    const subtotal = calculateSubtotal(selection, flavours, business.currency);
    required<HTMLElement>('[data-subtotal]').textContent = subtotal === null ? 'To be confirmed' : formatPrice(subtotal, business.currency);
    const details = requestDetails();
    const requestError = validateOrderRequestDetails(details);
    deliveryArea.hidden = details.fulfilment !== 'delivery';
    required<HTMLInputElement>('[data-request-field="deliveryArea"]').required = details.fulfilment === 'delivery';
    detailsError.textContent = count && requestError ? requestError : '';
    messageField.value = count ? buildOrderMessage(selection, flavours, business, requestError ? undefined : details) : '';
    const url = count && !requestError && canSendRequest(business) ? buildWhatsAppUrl(business.whatsappNumber, messageField.value) : null;
    sendLink.hidden = !url;
    disabledSend.hidden = !!url;
    if (url) sendLink.href = url;
    else sendLink.removeAttribute('href');
    if (focused && dialog.open) {
      const next = dialog.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focused)}"]`);
      if (next && !(next instanceof HTMLButtonElement && next.disabled)) next.focus();
      else (dialog.querySelector<HTMLInputElement>('.quantity-input') ?? required<HTMLButtonElement>('[data-close-order]')).focus();
    }
  }

  function changeQuantity(id: string, quantity: number) {
    try {
      selection = setQuantity(selection, flavours, id, quantity);
      render();
      const name = flavours.find((item) => item.id === id)!.name;
      status.textContent = quantity ? `${name}: ${quantity} ${quantity === 1 ? 'cup' : 'cups'}.` : `${name} removed.`;
    } catch (error) {
      render();
      status.textContent = error instanceof Error ? error.message : 'Please check your quantity.';
    }
  }

  document.querySelectorAll<HTMLButtonElement>('[data-open-order]').forEach((button) => {
    button.addEventListener('click', () => {
      opener = button;
      status.textContent = '';
      render();
      if (!dialog.open) dialog.showModal();
      document.body.classList.add('dialog-open');
    });
  });
  sendLink.addEventListener('click', (event) => {
    if (!sendLink.href) return;
    const details = requestDetails();
    const requestError = validateOrderRequestDetails(details);
    if (!selection || requestError || !canSendRequest(business)) return;
    event.preventDefault();
    const requestId = createRequestId();
    const message = buildOrderMessage(selection, flavours, business, details, requestId);
    const url = buildWhatsAppUrl(business.whatsappNumber, message);
    if (!url) return;
    const payload = buildAuditPayload(requestId, selection, flavours, details, business.currency);
    window.open(url, '_blank', 'noopener,noreferrer');
    void sendAudit(payload, business.auditWebhookUrl).then((logged) => {
      status.textContent = logged
        ? `Request ${requestId} submitted to tracking. Confirm it in WhatsApp.`
        : `Request ${requestId} prepared. WhatsApp opened, but tracking could not be saved.`;
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-close-order]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    const target = opener && opener.getClientRects().length ? opener : document.querySelector<HTMLElement>('.bag-button');
    target?.focus({ preventScroll: true });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((button) => {
    let addedTimer: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener('click', () => {
      const id = button.dataset.add!;
      try {
        selection = setQuantity(selection, flavours, id, (selection[id] ?? 0) + 1);
        render();
        const label = button.querySelector<HTMLElement>('.add-cup-label');
        if (label) {
          clearTimeout(addedTimer);
          label.textContent = 'Added!';
          button.dataset.added = '';
          addedTimer = setTimeout(() => {
            label.textContent = 'Add to your cups';
            delete button.dataset.added;
          }, 1000);
        }
        announce(`${flavours.find((item) => item.id === id)!.name} added to your cups.`);
      } catch (error) {
        announce(error instanceof Error ? error.message : 'Could not add this flavour.');
      }
    });
  });

  detailFields.forEach((field) => field.addEventListener('input', render));
  detailFields.forEach((field) => field.addEventListener('change', render));

  document.querySelectorAll<HTMLButtonElement>('[data-spotlight]').forEach((button) => {
    button.addEventListener('click', () => {
      const flavour = flavours.find((item) => item.id === button.dataset.spotlight);
      if (!flavour) return;
      const preview = getFlavourPresentation(flavour);
      const image = required<HTMLImageElement>('[data-hero-image]');
      image.src = preview.illustration;
      image.alt = preview.imageAlt;
      required<HTMLElement>('[data-hero-name]').textContent = preview.heroLabel;
      required<HTMLElement>('[data-hero-theme]').dataset.heroTheme = preview.theme;
      document.querySelectorAll('[data-spotlight]').forEach((node) => node.setAttribute('aria-pressed', String(node === button)));
      document.querySelectorAll<HTMLElement>('[data-card]').forEach((node) => {
        if (node.dataset.card === flavour.id) node.dataset.featured = '';
        else delete node.dataset.featured;
      });
    });
  });

  required<HTMLButtonElement>('[data-clear]').addEventListener('click', () => {
    selection = {};
    clearRequestDetails();
    render();
    status.textContent = 'Your selection has been cleared.';
    required<HTMLButtonElement>('[data-close-order]').focus();
  });
  required<HTMLButtonElement>('[data-copy]').addEventListener('click', async () => {
    if (!messageField.value) return;
    try {
      await navigator.clipboard.writeText(messageField.value);
      status.textContent = business.mode === 'draft' ? 'Draft message copied. Nothing has been sent.' : 'Message copied. Nothing has been sent.';
    } catch {
      required<HTMLDetailsElement>('.message-details').open = true;
      messageField.focus();
      messageField.select();
      status.textContent = 'Clipboard unavailable. The message is selected; copy it using your device’s copy command.';
    }
  });

  render();
  document.querySelectorAll<HTMLElement>('[data-enhance]').forEach((node) => { node.hidden = false; });
}

initNavMenu();
initFlavourCards();
initStorefront();