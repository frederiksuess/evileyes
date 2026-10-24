// Kurze Statusmeldung oben am Bildschirm.
const el = document.getElementById('hinweis');
let timer = null;

export function zeige(text, ms = 3200) {
  el.textContent = text;
  el.classList.add('an');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('an'), ms);
}

export function verstecke() {
  clearTimeout(timer);
  el.classList.remove('an');
}
