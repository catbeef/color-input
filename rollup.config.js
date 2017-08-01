import rollupPluginBabili      from 'rollup-plugin-babili';
import rollupPluginNodeResolve from 'rollup-plugin-node-resolve';

export default [
  {
    dest    : './dist/index.cjs.js',
    entry   : './src/index.js',
    format  : 'cjs',
    plugins : [ rollupPluginNodeResolve() ]
  },
  {
    dest    : './dist/index.iife.js',
    entry   : './src/iife.js',
    format  : 'iife',
    plugins : [ rollupPluginNodeResolve() ]
  },
  {
    dest    : './dist/index.iife.min.js',
    entry   : './src/iife.js',
    format  : 'iife',
    plugins : [
      rollupPluginNodeResolve(),
      rollupPluginBabili({
        comments: false,
        keepClassName: true
      })
    ]
  }
];
