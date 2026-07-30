/* global document, HTMLButtonElement, HTMLSelectElement, HTMLInputElement, HTMLElement */

const estimator = document.querySelector('#pickup-estimator');
const product = document.querySelector('#product');
const quantity = document.querySelector('#quantity');
const calculate = document.querySelector('#calculate-estimate');
const output = document.querySelector('#estimate-output');

if (
  estimator instanceof HTMLElement &&
  product instanceof HTMLSelectElement &&
  quantity instanceof HTMLInputElement &&
  calculate instanceof HTMLButtonElement &&
  output instanceof HTMLElement
) {
  calculate.addEventListener('click', () => {
    const selected = product.selectedOptions[0];
    const productName = selected?.dataset.name ?? 'sample item';
    const unitPrice = Number(product.value);
    const requestedQuantity = Number.parseInt(quantity.value, 10);
    const validQuantity = Math.min(12, Math.max(1, Number.isFinite(requestedQuantity) ? requestedQuantity : 1));
    const total = unitPrice * validQuantity;

    quantity.value = String(validQuantity);
    output.replaceChildren();

    const summary = document.createElement('strong');
    summary.textContent = `${validQuantity} × ${productName}: $${total}`;
    const note = document.createElement('span');
    note.textContent = ' — fictional planning estimate only; nothing was ordered, sent, or saved.';
    output.append(summary, note);
  });
}
