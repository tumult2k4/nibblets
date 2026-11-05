/**
 * Chat topic icons (§13.2, P5.1): small procedural pictures drawn into a speech bubble, so a conversation reads at a
 * glance: an apple for food, a raincloud for the weather, a Gnasher's fangs for danger, and so on.
 */
import type { ChatTopic } from '../shared/types';

type Ctx = CanvasRenderingContext2D;
const INK = '#2e2a24';

function blob(x: Ctx, fill: string, path: () => void): void {
  x.beginPath();
  path();
  x.fillStyle = fill;
  x.fill();
  x.lineWidth = 2;
  x.strokeStyle = INK;
  x.stroke();
}

const apple = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#d8473a', () => {
    x.moveTo(cx, cy - 6);
    x.bezierCurveTo(cx + 13, cy - 14, cx + 15, cy + 8, cx, cy + 11);
    x.bezierCurveTo(cx - 15, cy + 8, cx - 13, cy - 14, cx, cy - 6);
  });
  blob(x, '#5a9a3c', () => x.ellipse(cx + 5, cy - 11, 5, 2.5, -0.5, 0, Math.PI * 2));
};

const cloud = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#f4c542', () => x.arc(cx + 7, cy - 7, 6, 0, Math.PI * 2));
  blob(x, '#c9d6e3', () => {
    x.arc(cx - 6, cy + 1, 7, Math.PI * 0.5, Math.PI * 1.5);
    x.arc(cx + 1, cy - 4, 8, Math.PI, Math.PI * 1.9);
    x.arc(cx + 9, cy + 1, 6, Math.PI * 1.5, Math.PI * 0.5);
    x.closePath();
  });
  x.strokeStyle = '#4aa3d8';
  x.lineWidth = 2.5;
  for (const dx of [-6, 1, 8]) { x.beginPath(); x.moveTo(cx + dx, cy + 10); x.lineTo(cx + dx - 2, cy + 15); x.stroke(); }
};

const fangs = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#6b5a4a', () => x.ellipse(cx, cy, 14, 10, 0, 0, Math.PI * 2));
  blob(x, '#f0c22b', () => x.arc(cx - 6, cy - 3, 2.6, 0, Math.PI * 2));
  blob(x, '#f0c22b', () => x.arc(cx + 6, cy - 3, 2.6, 0, Math.PI * 2));
  blob(x, '#fff8ea', () => { x.moveTo(cx - 6, cy + 3); x.lineTo(cx - 3, cy + 10); x.lineTo(cx - 1, cy + 3); x.closePath(); });
  blob(x, '#fff8ea', () => { x.moveTo(cx + 1, cy + 3); x.lineTo(cx + 3, cy + 10); x.lineTo(cx + 6, cy + 3); x.closePath(); });
};

/** two little heads leaning in, with "…" between them */
const whisper = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#8fbf5a', () => x.arc(cx - 9, cy + 2, 6, 0, Math.PI * 2));
  blob(x, '#b8a36a', () => x.arc(cx + 9, cy + 2, 6, 0, Math.PI * 2));
  x.fillStyle = INK;
  for (const dx of [-3, 0, 3]) { x.beginPath(); x.arc(cx + dx, cy - 9, 1.4, 0, Math.PI * 2); x.fill(); }
};

const head = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#8fbf5a', () => { x.moveTo(cx - 12, cy - 6); x.lineTo(cx - 5, cy - 2); x.lineTo(cx - 6, cy + 4); x.closePath(); });
  blob(x, '#8fbf5a', () => { x.moveTo(cx + 12, cy - 6); x.lineTo(cx + 5, cy - 2); x.lineTo(cx + 6, cy + 4); x.closePath(); });
  blob(x, '#8fbf5a', () => x.arc(cx, cy + 1, 8, 0, Math.PI * 2));
  x.fillStyle = INK;
  x.beginPath(); x.arc(cx - 3, cy, 1.3, 0, Math.PI * 2); x.arc(cx + 3, cy, 1.3, 0, Math.PI * 2); x.fill();
};

const gem = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#6ec6d9', () => {
    x.moveTo(cx - 10, cy - 3); x.lineTo(cx - 5, cy - 9); x.lineTo(cx + 5, cy - 9); x.lineTo(cx + 10, cy - 3); x.lineTo(cx, cy + 11); x.closePath();
  });
  x.beginPath(); x.moveTo(cx - 10, cy - 3); x.lineTo(cx + 10, cy - 3); x.stroke();
};

const hill = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#7fae55', () => { x.moveTo(cx - 13, cy + 9); x.quadraticCurveTo(cx - 2, cy - 12, cx + 13, cy + 9); x.closePath(); });
  x.beginPath(); x.moveTo(cx + 1, cy - 2); x.lineTo(cx + 1, cy - 13); x.stroke();
  blob(x, '#e0a822', () => { x.moveTo(cx + 1, cy - 13); x.lineTo(cx + 9, cy - 10); x.lineTo(cx + 1, cy - 7); x.closePath(); });
};

const grave = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#a9a49a', () => {
    x.moveTo(cx - 8, cy + 10); x.lineTo(cx - 8, cy - 3); x.arc(cx, cy - 3, 8, Math.PI, 0); x.lineTo(cx + 8, cy + 10); x.closePath();
  });
  x.beginPath(); x.moveTo(cx, cy - 7); x.lineTo(cx, cy + 4); x.moveTo(cx - 4, cy - 3); x.lineTo(cx + 4, cy - 3); x.stroke();
};

const lantern = (x: Ctx, cx: number, cy: number) => {
  blob(x, '#e86a3a', () => x.ellipse(cx, cy + 1, 8, 10, 0, 0, Math.PI * 2));
  x.beginPath(); x.moveTo(cx, cy - 9); x.lineTo(cx, cy - 13); x.stroke();
  x.fillStyle = '#f4c542';
  x.beginPath(); x.ellipse(cx, cy + 1, 3, 5, 0, 0, Math.PI * 2); x.fill();
};

const grumble = (x: Ctx, cx: number, cy: number) => {
  x.strokeStyle = '#7a3b8f';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(cx - 12, cy);
  for (let i = 0; i < 6; i++) x.quadraticCurveTo(cx - 10 + i * 4, cy + (i % 2 ? 8 : -8), cx - 8 + i * 4, cy);
  x.stroke();
  x.fillStyle = INK;
  x.beginPath(); x.arc(cx + 11, cy - 8, 2, 0, Math.PI * 2); x.fill();
};

const DRAW: Record<ChatTopic, (x: Ctx, cx: number, cy: number) => void> = {
  food: apple, weather: cloud, danger: fangs, gossip: whisper, a_person: head, trinkets: gem, a_place: hill,
  the_dead: grave, festival: lantern, complaint: grumble,
};

export function drawTopic(x: Ctx, t: ChatTopic, cx: number, cy: number): void {
  x.save();
  x.lineJoin = 'round';
  x.lineCap = 'round';
  DRAW[t](x, cx, cy);
  x.restore();
}
