import rollupPluginBabili      from 'rollup-plugin-babili';
import rollupPluginNodeResolve from 'rollup-plugin-node-resolve';

export default [
  {
    entry   : './src/index.js',
    dest    : './dist/index.cjs.js',
    format  : 'cjs',
    plugins : [ rollupPluginNodeResolve() ]
  },
  {
    entry   : './src/iife.js',
    targets : [
      {
        dest    : './dist/index.iife.js',
        format  : 'iife',
        plugins : [ rollupPluginNodeResolve() ]
      },
      {
        dest    : './dist/index.iife.min.js',
        format  : 'iife',
        plugins : [
          rollupPluginNodeResolve(),
          rollupPluginBabili({
            comments: false,
            keepClassName: true
          })
        ]
      }
    ]
  }
];
