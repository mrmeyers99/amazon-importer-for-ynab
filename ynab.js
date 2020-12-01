const axios = require('axios');
const ynab = require("ynab");
const ynab_url = 'https://api.youneedabudget.com/v1/budgets/' + process.env.BUDGET_ID
const _ = require('lodash');
const config = {
    'headers': {'Authorization': "bearer " + process.env.YNAB_TOKEN},
};
console.log(ynab_url);

module.exports = {
    updateTransaction(transactionId, transaction) {
        return axios.put(ynab_url + '/transactions/' + transactionId, transaction, config)
            .then(function(response) {
                console.log(response.data)
            })
            .catch(reason => {
                if (reason.response.status === 409) {
                    console.log('Transaction already uploaded');
                } else {
                    console.log(reason.response.status);
                    console.log(reason.response.data);
                    console.log(transaction);
                    console.log(transaction.transaction.subtransactions);
                }
            });
    },
    createTransaction: function (transaction) {
        console.log(ynab_url + '/transactions');
        return axios.post(ynab_url + '/transactions', transaction, config)
            .then(function(response) {
                console.log(response.data.data.transaction_ids)
            })
            .catch(reason => {
            if (reason.response.status === 409) {
                console.log('Transaction already uploaded');
            } else {
                console.log(reason.response.status);
                console.log(reason.response.data);
                console.log(transaction);
                console.log(transaction.transaction.subtransactions);
            }
        });
    },
    createTransactions: function (transactions) {
        console.log(ynab_url + '/transactions');
        return axios.post(ynab_url + '/transactions', {
                'transactions': transactions
            }, config)
            .then(function(response) {
                console.log("Duplicate import ids: " + response.data.data.duplicate_import_ids.length);
                console.log("Newly Imported Transactions: " + response.data.data.transaction_ids.length);
                if (response.data.data.transaction_ids.length > 0) {
                    console.log(response.data.data.transaction_ids)
                }
            })
            .catch(reason => {
            if (reason.response.status === 409) {
                console.log('Transaction already uploaded');
            } else if (reason.response.status === 400) {
                console.log(reason.response.data);
                let errors = reason.response.data.error.detail.split(', ');
                _.forEach(errors, function(error) {
                    const indexRegex = /.*\(index: (?<index>\d+)\)/;
                    const found = error.match(indexRegex);
                    console.log(error);
                    console.log(transactions[found.groups.index]);
                })
            } else {
                console.log(reason.response.status);
                console.log(reason.response.data);
            }
        });
    },
    getTransactions: function (sinceDate) {
        const url = ynab_url + '/transactions?since_date='+sinceDate;
        return axios.get(url, config)
            .then(function(response) {
                return response.data.data.transactions;
            });


    }
};
