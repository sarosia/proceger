module.exports = {
  'env': {
    'browser': true,
    'commonjs': true,
    'es2021': true,
    'node': true,
  },
  'extends': [
    'google',
  ],
  'parser': '@babel/eslint-parser',
  'parserOptions': {
    'ecmaVersion': 12,
    'requireConfigFile': false,
  },
  'rules': {
    'require-jsdoc': 0,
  },
};
