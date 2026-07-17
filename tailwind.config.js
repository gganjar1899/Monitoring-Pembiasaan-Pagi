/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7EE",
        ink: "#1C2622",
        muted: "#5C6B63",
        line: "#E1DCC9",
        green: {
          deep: "#0F4A38",
          DEFAULT: "#145C46",
          soft: "#E3F0EA",
        },
        gold: {
          DEFAULT: "#C9A227",
          soft: "#FBF2D9",
          deep: "#9C7D1C",
        },
        crimson: {
          DEFAULT: "#A83A2C",
          soft: "#F7E7E3",
        },
      },
      fontFamily: {
        display: ["'Lora'", "Georgia", "serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
