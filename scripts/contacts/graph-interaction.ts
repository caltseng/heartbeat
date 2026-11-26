// Fixed browser program: report text is never interpolated into executable code.
export const GRAPH_SCRIPT = String.raw`(() => {
  const workspace = document.querySelector('.workspace');
  const inspector = document.querySelector('#inspector');
  const status = document.querySelector('#selection-status');
  const picker = document.querySelector('#person-picker');
  const sheets = [...document.querySelectorAll('.map-sheet')];
  const sheetPicker = document.querySelector('#sheet-picker');
  let selected = null;
  function select(id, focus) {
    const source = document.getElementById(id);
    if (!source || !source.matches('.selection')) return;
    selected = id;
    const copy = source.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    inspector.replaceChildren(copy);
    document.querySelectorAll('[data-person]').forEach(link => {
      if (link.dataset.person === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    picker.value = id;
    const sheet = sheets.find(node => node.querySelector('[data-person="' + id + '"]'));
    if (sheet) {
      const index = sheets.indexOf(sheet);
      showSheet(index);
      cameras[index].reveal(sheet.querySelector('[data-person="' + id + '"] circle'));
    }
    status.textContent = source.querySelector('h3').textContent;
    if (focus) inspector.focus({ preventScroll: true });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-person]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    select(link.dataset.person, true);
  });
  picker.addEventListener('change', () => select(picker.value, true));
  const cameras = sheets.map(sheet => {
    const svg = sheet.querySelector('svg');
    const output = sheet.querySelector('output');
    let box = [0, 0, 1080, 1080], pointer = null, dragged = false;
    function paint() {
      svg.setAttribute('viewBox', box.join(' '));
      output.textContent = Math.round(108000 / box[2]) + '%';
    }
    function zoom(factor) {
      const size = Math.max(270, Math.min(1620, box[2] * factor));
      box = [box[0] + (box[2] - size) / 2, box[1] + (box[3] - size) / 2, size, size];
      paint();
    }
    function pan(x, y) {
      box[0] = Math.max(-540, Math.min(1080, box[0] + x * box[2]));
      box[1] = Math.max(-540, Math.min(1080, box[1] + y * box[3]));
      paint();
    }
    sheet.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.camera;
      if (action === 'in') zoom(0.8);
      if (action === 'out') zoom(1.25);
      if (action === 'fit') { box = [0, 0, 1080, 1080]; paint(); }
      if (action === 'left') pan(-0.15, 0);
      if (action === 'right') pan(0.15, 0);
      if (action === 'up') pan(0, -0.15);
      if (action === 'down') pan(0, 0.15);
    }));
    svg.addEventListener('keydown', event => {
      if (event.target !== svg) return;
      const actions = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0],
        ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] };
      if (actions[event.key]) { event.preventDefault(); pan(...actions[event.key]); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(0.8); }
      if (event.key === '-') { event.preventDefault(); zoom(1.25); }
      if (event.key === 'Home') { event.preventDefault(); box = [0, 0, 1080, 1080]; paint(); }
    });
    svg.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || event.target.closest('a')) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      dragged = false;
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const rect = svg.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      dragged = true;
      pan(-dx / size, -dy / size);
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    function release(event) {
      if (pointer && pointer.id === event.pointerId) pointer = null;
    }
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
    svg.addEventListener('lostpointercapture', release);
    paint();
    return { reveal: circle => {
      const x = Number(circle.getAttribute('cx')), y = Number(circle.getAttribute('cy'));
      if (x < box[0] + 45 || x > box[0] + box[2] - 45 ||
          y < box[1] + 45 || y > box[1] + box[3] - 45) {
        box[0] = x - box[2] / 2;
        box[1] = y - box[3] / 2;
        paint();
      }
    } };
  });
  function showSheet(index) {
    sheets.forEach((sheet, i) => { sheet.hidden = i !== index; });
    sheetPicker.value = String(index);
  }
  sheetPicker.addEventListener('change', () => showSheet(Number(sheetPicker.value)));
  document.querySelector('#previous-sheet').addEventListener('click', () =>
    showSheet((Number(sheetPicker.value) + sheets.length - 1) % sheets.length));
  document.querySelector('#next-sheet').addEventListener('click', () =>
    showSheet((Number(sheetPicker.value) + 1) % sheets.length));
  document.querySelector('#clear-selection').addEventListener('click', () => {
    selected = null;
    inspector.replaceChildren();
    status.textContent = 'Select a person to inspect their saved evidence.';
    picker.value = '';
    document.querySelectorAll('[aria-current]').forEach(node => node.removeAttribute('aria-current'));
    picker.focus({ preventScroll: true });
  });
  document.querySelector('#return-person').addEventListener('click', () => {
    const sheet = sheets.find(node => !node.hidden);
    const link = selected && sheet.querySelector('[data-person="' + selected + '"]');
    (link || picker).focus({ preventScroll: true });
  });
  workspace.classList.add('interactive');
  document.documentElement.classList.add('graph-ready');
  showSheet(0);
})();`;
