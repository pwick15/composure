/** Grows a textarea to fit its content. */
export function autosize(el: HTMLTextAreaElement) {
  el.style.height = '0px'
  el.style.height = `${el.scrollHeight}px`
}
