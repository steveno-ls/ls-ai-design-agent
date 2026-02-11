import { preset } from "@lightspeed/unified-components-helios-theme/preset";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@lightspeed/unified-components-helios-theme/dist/**/*.js",
  ],
  presets: [preset],
  theme: { extend: {} },
  plugins: [],
};
