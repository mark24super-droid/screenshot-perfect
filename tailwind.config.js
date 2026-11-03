/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "#F4F5F8",
        surface: "#FFFFFF",
        sidebar: "#FAFAFC",
        ink: {
          DEFAULT: "#20212A",
          secondary: "#737786",
        },
        line: "#E5E7EF",
        primary: {
          DEFAULT: "#635BEB",
          hover: "#5148D8",
          soft: "#EFEEFD",
        },
        success: "#20A36A",
        warning: "#E7A33E",
        danger: "#D95364",
        info: "#4387E8",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        lg: "10px",
        xl: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(32, 33, 42, 0.04)",
        pop: "0 12px 32px rgba(32, 33, 42, 0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
      },
    },
  },
  plugins: [],
};
