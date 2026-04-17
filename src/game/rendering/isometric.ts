/**
 * Isometric projection + cube drawing (2.5D, no WebGL).
 * Grid (row, col) → screen using classic diamond-map formulas.
 */

export type IsoPoint = { x: number; y: number };

/** Screen position of the center of cell (row, col) on the isometric floor plane. */
export function isoCellCenter(
  col: number,
  row: number,
  tileWidth: number,
  tileHeight: number
): IsoPoint {
  return {
    x: ((col - row) * tileWidth) / 2,
    y: ((col + row) * tileHeight) / 2,
  };
}

/**
 * Floor cell center `(footX, footY)` is where the cube meets the grid.
 * Top face center is offset “up” along the isometric vertical by one cell height
 * (scaled by cube width vs tile width) so the stack lines up with the diamond grid.
 */
export function cubeTopCenterFromFoot(
  footX: number,
  footY: number,
  tileWidth: number,
  tileHeight: number,
  cubeSize: number
): IsoPoint {
  const rise = tileHeight * (cubeSize / tileWidth);
  return { x: footX, y: footY - rise };
}

export type CubeFaceColors = {
  top: string;
  left: string;
  right: string;
  stroke: string;
};

export const DEFAULT_CUBE_COLORS: CubeFaceColors = {
  top: "#ffffff",
  left: "#d4d4d8",
  right: "#a1a1aa",
  stroke: "#171717",
};

export const REVEAL_HIGHLIGHT_COLORS: CubeFaceColors = {
  top: "#dcfce7",
  left: "#86efac",
  right: "#4ade80",
  stroke: "#14532d",
};

export const REVEAL_DIM_COLORS: CubeFaceColors = {
  top: "#e5e7eb",
  left: "#d1d5db",
  right: "#cbd5e1",
  stroke: "#52525b",
};

/**
 * Draw one isometric cube. (cx, cy) is the center of the top rhombus (bright face).
 * `size` controls the footprint of the top face (width of rhombus ≈ size).
 */
export function drawCube(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  depth: number,
  colors: CubeFaceColors,
  strokeWidth = 1
): void {
  const hw = size * 0.5;
  const qh = size * 0.25;

  const top = [
    { x: cx, y: cy - qh },
    { x: cx + hw, y: cy },
    { x: cx, y: cy + qh },
    { x: cx - hw, y: cy },
  ];

  const left = [
    { x: cx - hw, y: cy },
    { x: cx, y: cy + qh },
    { x: cx, y: cy + qh + depth },
    { x: cx - hw, y: cy + depth },
  ];

  const right = [
    { x: cx + hw, y: cy },
    { x: cx, y: cy + qh },
    { x: cx, y: cy + qh + depth },
    { x: cx + hw, y: cy + depth },
  ];

  const stroke = () => {
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  };

  ctx.beginPath();
  ctx.moveTo(left[0]!.x, left[0]!.y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i]!.x, left[i]!.y);
  ctx.closePath();
  ctx.fillStyle = colors.left;
  ctx.fill();
  stroke();

  ctx.beginPath();
  ctx.moveTo(right[0]!.x, right[0]!.y);
  for (let i = 1; i < right.length; i++) ctx.lineTo(right[i]!.x, right[i]!.y);
  ctx.closePath();
  ctx.fillStyle = colors.right;
  ctx.fill();
  stroke();

  ctx.beginPath();
  ctx.moveTo(top[0]!.x, top[0]!.y);
  for (let i = 1; i < top.length; i++) ctx.lineTo(top[i]!.x, top[i]!.y);
  ctx.closePath();
  ctx.fillStyle = colors.top;
  ctx.fill();
  stroke();
}

/** Faint floor grid: diamond per cell, all rows/cols (including empty cells). */
export function drawIsoFloorGrid(
  ctx: CanvasRenderingContext2D,
  rows: number,
  cols: number,
  tileWidth: number,
  tileHeight: number,
  offsetX: number,
  offsetY: number,
  lineColor = "rgba(180, 180, 190, 0.55)",
  lineWidth = 1
): void {
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, y } = isoCellCenter(c, r, tileWidth, tileHeight);
      const cx = x + offsetX;
      const cy = y + offsetY;
      const hw = tileWidth * 0.5;
      const qh = tileHeight * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - qh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + qh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      ctx.stroke();
    }
  }
}
