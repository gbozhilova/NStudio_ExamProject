import template from './contact.html?raw';
import './contact.css';
import { translateRoot } from '../../services/i18n.js';

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);
}
