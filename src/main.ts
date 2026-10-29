import './style.css';
import { Game } from './game';

async function boot() {
  // canvas textures (door signs) use Plex Mono, so wait briefly for the webfonts
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fonts API unavailable */
  }
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const touch = document.getElementById('touch-layer') as HTMLElement;
  const game = new Game(canvas, ui, touch);
  if (import.meta.env.DEV) (window as unknown as { overtime: unknown }).overtime = game.debug();
}

void boot();
