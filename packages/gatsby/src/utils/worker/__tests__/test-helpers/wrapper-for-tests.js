// spawned process won't use jest config to support TS, so we need to add support ourselves
require(`@babel/register`)({
  extensions: [`.js`, `.ts`],
  configFile: require.resolve(`../../../../../babel.config.js`),
  cache: false,
  ignore: [/node_modules/],
})

module.exports = require(`./child-for-tests`)
