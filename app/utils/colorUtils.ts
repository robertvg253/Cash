// Utilidad para mapear nombres de color a hexadecimales
export function getColorHex(colorName: string | undefined | null): string {
  if (!colorName) return '#CCCCCC';
  const color = colorName.trim().toLowerCase();
  const colorMap: Record<string, string> = {
    'lila': '#C084FC',
    'blanco': '#FFFFFF',
    'azul': '#2563EB',
    'gris': '#9CA3AF',
    'rosa': '#F472B6',
    'negro': '#111827',
  };
  return colorMap[color] || '#CCCCCC';
} 