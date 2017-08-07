import enUS from './en-US';

export default Object.assign({}, enUS, {
  prefix: 'select colour',
  colors: enUS
    .colors
    .map(([ value, label ]) => [ value, label.replace(/\bgray\b/, 'grey') ])
});
