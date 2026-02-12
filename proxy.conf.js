const bypassFn = function (req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, HEAD, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      return res.send('');
    } else {
      return null;
    }
  } catch (error) {
    console.log('error', error);
  }
};

const PROXY_CONFIG = {
  '/bff': {
    target: 'http://notification-bff',
    secure: false,
    pathRewrite: {
      '^.*/bff': '',
    },
    changeOrigin: true,
    logLevel: 'debug',
    bypass: bypassFn,
  },
};

module.exports = PROXY_CONFIG;
