const path = require('path');
const slsw = require('serverless-webpack');

const webpack = require('webpack');
const npmPackageVersion = require('./package.json').version;

module.exports = {
  devtool: 'source-map',
  entry: slsw.lib.entries,
  resolve: {
    extensions: [
      '.js',
      '.json',
      '.ts',
      '.tsx'
    ]
  },
  output: {
    devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    // devtoolFallbackModuleFilenameTemplate: '[absolute-resource-path]?[hash]',
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js'
  },
  target: 'node',
  plugins: [
    new webpack.DefinePlugin({
      '__NPM_PACKAGE_VERSION__': JSON.stringify(npmPackageVersion)
    }),
  ],
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        use: [
          {
            loader: 'ts-loader'
          }
        ],
      }
    ]
  }
};
