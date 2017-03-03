import App from './App';

const app = new App();

window.onresize = app.onResize.bind(app);
window.onmousedown = app.onMouseDown.bind(app);
window.onmousemove = app.onMouseMove.bind(app);