type FontOptions = Record<string, unknown>;

// Keep the existing font API without making production builds download a
// Google Fonts stylesheet. The font faces are declared in globals.css and
// loaded by the browser at runtime.
export function Plus_Jakarta_Sans(_options?: FontOptions) {
  return {
    className: "font-sans",
    variable: "font-plus-jakarta",
  };
}

export const font = Plus_Jakarta_Sans();
