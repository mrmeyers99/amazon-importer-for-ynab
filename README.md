# amazon-importer-for-ynab

Create a .env file with three properties:

* YNAB_TOKEN (obtained from ynab)
* ACCOUNT_ID (ynab account id you want to import transactions to)
* BUDGET_ID (ynab budget id of the budget you want to import transactions to)

To Import Transactions:
Use the Chrome plugin Amazon Order History Reporter to download this years' orders
Download the CSV file

Run the app:

```
node app.js /path/to/orders.csv
```
