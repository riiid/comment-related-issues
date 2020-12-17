/**
 * Generate a markdown table from action inputs.
 */

const yaml = require('yaml');
const path = require('path');
const fs = require('fs');
const markdownTable = require('markdown-table');

(async () => {
  const action = fs.readFileSync(path.resolve(__dirname, '../action.yml'), 'utf-8');
  const {inputs} = yaml.parse(action);
  let table = [['Name', 'Required', 'Default', 'Description']];
  for (const [inputName, value] of Object.entries(inputs)) {
    const description = value.description;
    const required = Boolean(value.required);
    const defaultValue = value.default || '';
    table.push([
      inputName,
      required ? '[x]' : '[ ]',
      defaultValue,
      description,
    ]);
  }
  
  console.log(markdownTable(table, {
    align: ['', 'c', '', ''],
  }));
})();
