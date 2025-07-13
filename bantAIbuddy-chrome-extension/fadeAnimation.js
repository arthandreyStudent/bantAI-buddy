document.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(() => {
    document.body.classList.add('fade-in');
  });
});

document.querySelectorAll('a.button2').forEach(button => {
  button.addEventListener('click', e => {
    e.preventDefault();
    document.body.classList.remove('fade-in');
    document.body.classList.add('fade-in');

    setTimeout(() => {
      window.location.href = button.href;
    }, 0);
  });
});