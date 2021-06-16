const csv = require('csv-parser');
const fs = require('fs');
const _ = require('lodash');
const stripBom = require('strip-bom-stream');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const ynab = require('./ynab');

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('usage: node app.js orderFile');
    process.exit(1);
}
const orderFile = args[0];
console.log('Orders file: ' + orderFile);
readToList(orderFile).then(function(orders) {
    const ynabTransactions = _.chain(orders)
        .filter(row => !row['order id'].startsWith("D01") && row['order id'] !== 'order id')
        .flatMap(convertToYnabTransaction)
        .filter(t => t['amount'] !== 0)
        .value();

    ynab.createTransactions(ynabTransactions).then(function() {
        ynab.getTransactions('2020-09-01').then(function(transactions) {
            const transactionIds = _.chain(transactions)
                .filter((t) => /^[0-9A-Z]{3}-[0-9]{7}-[0-9]{7}/.test(t.memo))
                .map((t) => t.memo.substring(0, 19))
                .value();

            const amazonTransactionIds = _.map(orders, (row) => row['order id']);
            const extraIds = _.filter(transactionIds, (id) => !amazonTransactionIds.includes(id))
            console.log('# Cancelled Order Ids Found: ' + extraIds.length)
            _.forEach(extraIds, (id) => console.log(id));
        });
    });

});

function convertToYnabTransaction(order) {
    const orderDate = order['date'];
    let amount = Math.round(-(Number(order['total'].replace('$', '')) + Number(order['gift'].replace('$', ''))) * 1000);

    const payee = 'Amazon';
    const transactions = [];

    const importId = order['order id'];
    if (order['items'].includes("Amazon.com Gift Card Balance Auto-Reload")) {
        amount = -amount;
        transactions.push({
            'account_id': process.env.ACCOUNT_ID,
            'date': orderDate,
            'amount': amount * 0.02,
            'payee_name': 'Amazon',
            'import_id': importId + ';CashBack',
            'memo': importId + ' - ' + 'Cash Back',
            'cleared': 'cleared'
        });
    }
    if (order['refund'] !== '' && order['refund'] !== 'pending') {
        transactions.push({
            'account_id': process.env.ACCOUNT_ID,
            'date': orderDate,
            'amount': Math.round(order['refund'].replace('$', '') * 1000),
            'payee_name': payee,
            'import_id': importId + ';Refund',
            'memo': order['order id'] + ' - refund',
            'cleared': 'cleared'
        });
    }
    transactions.push({
        'account_id': process.env.ACCOUNT_ID,
        'date': orderDate,
        'amount': amount,
        'payee_name': payee,
        'import_id': importId,
        'memo': (order['order id'] + ' - ' + order['items']).substr(0, 200),
        'cleared': 'cleared'
    });

    // console.log(transactions);
    return transactions;
}

function readToList(file) {
    return new Promise(function(resolve, reject) {
        setTimeout(function() {
            const items = [];
            fs.createReadStream(file)
                .pipe(stripBom())
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
