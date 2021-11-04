const fs = require('fs');
const csv = require('csv-parser');
const dateFormat = require('dateformat');
const _ = require('lodash');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const ynab = require('./ynab');

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('usage: node app_from_orders.js orderFile itemFile');
  process.exit(1);
}
const orderFile = args[0];
const itemFile = args[1];

console.log('Orders file: ' + orderFile);
console.log('Items file: ' + itemFile);

readToList(orderFile).then(function(orders) {
  readToList(itemFile).then(function(items) {
    joinOrdersItems(orders, items);
  });
});

function joinOrdersItems(orders, items) {
  console.log("got " + orders.length + " orders and " + items.length + " items");
  let shippedOrders = _.filter(orders, function(order) {
    return order['Order Status'] === 'Shipped';
  });
  let groupedOrders = _.groupBy(shippedOrders, function(order) { return order['Order ID'] + "_" + order['Carrier Name & Tracking Number']});
  let groupedItems = _.groupBy(items, function(item) { return item['Order ID'] + "_" + item['Carrier Name & Tracking Number']});

  console.log("orders:", _.keys(groupedOrders));
  console.log("items:", _.keys(groupedItems));

  var ynabTransactions = _.flatMapDeep(_.keys(groupedOrders), function(key) {
    return convertToYnabTransactions(groupedOrders[key][0], groupedItems[key]);
  });

  _.forEach(ynabTransactions, ynab.createTransaction);
}

function convertToYnabTransactions(order, items) {
  const orderDate = dateFormat(dateFormat(order['Order Date'], 'mm/dd/yyyy'), 'yyyy-mm-dd');
  let amount = Math.round(-(order['Total Charged'].substr(1) * 1000));
  const payee = 'Amazon';
  const transactions = [];
  if (items.length === 1) {
    const isin = items[0]['ASIN/ISBN'];
    const importId = order['Order ID'] + ';' + isin;
    transactions.push({
      "transaction": {
        'account_id': process.env.ACCOUNT_ID,
        'date': orderDate,
        'amount': amount,
        'payee_name': payee,
        'import_id': importId,
        'memo': (order['Order ID'] + ' - ' + items[0]['Title']).substr(0, 100),
        'cleared': 'cleared'
      }
    });
  } else {
    const itemsTotal = items.reduce(function(a, b) {
      return a - Math.round(b['Item Total'].substr(1) * 1000);
    }, 0);
    const adjustment = parseInt(((amount - itemsTotal) / items.length).toFixed(0));
    console.log(items.length + ' item(s) for ' + order['Order ID'] + ' - ' + amount + ' total ' + itemsTotal + ' and will be adjusted by ' + adjustment);
    items.forEach(function(item) {
      const itemCharge = Math.round(-(item['Item Total'].substr(1) * 1000)) + adjustment;
      console.log(item['Title'] + " will be charged " + itemCharge + ' instead of ' + Math.round(-(item['Item Total'].substr(1) * 1000)));
      transactions.push({
        "transaction": {
          'account_id': process.env.ACCOUNT_ID,
          'date': orderDate,
          'amount': itemCharge,
          'payee_name': payee,
          'memo': (order['Order ID'] + ' - ' + item['Title']).substr(0, 200),
          'import_id': order['Order ID'] + ';' + item['ASIN/ISBN'],
          'cleared': 'cleared',
        }
      });
    });

  }
  return transactions;
}

function readToList(file) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      const items = [];
      fs.createReadStream(file)
      .pipe(csv())
      .on('data', (row) => {
        items.push(row);
      })
      .on('end', () => {
        resolve(items);
      });
    }, 2000);
  });
}
