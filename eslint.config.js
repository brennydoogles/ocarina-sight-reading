import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        console: 'readonly', localStorage: 'readonly', performance: 'readonly',
        AudioContext: 'readonly', MediaStream: 'readonly', Float32Array: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', process: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        DOMException: 'readonly', ResizeObserver: 'readonly',
        getComputedStyle: 'readonly', AnalyserNode: 'readonly',
        fetch: 'readonly', DOMParser: 'readonly',
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      // Cosmetic template-formatting rules only; they fight compact single-line
      // markup and say nothing about correctness.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attributes-order': 'off',
      'vue/multiline-html-element-content-newline': 'off',
    },
  },
];
