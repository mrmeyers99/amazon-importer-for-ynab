const csv = require('csv-parser');
const fs = require('fs');
const _ = require('lodash');
const stripBom = require('strip-bom-stream');
const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const ynab = require('./ynab');

// Initialize Gemini
const MODEL_NAME = "gemini-2.5-flash"; 
const API_KEY = process.env.GEMINI_API_KEY;

async function summarizeItemsWithGemini(itemTitles) {
    if (!API_KEY) {
        console.error("GEMINI_API_KEY is not set. Skipping summarization.");
        return itemTitles.join(', ');
    }

    const client = new GoogleGenAI({ apiKey: API_KEY });

    const joinedItems = itemTitles.join(', ');

    const prompt = `Summarize the following Amazon items for a YNAB transaction memo. 
Focus on the brand and the main product name. 
Keep it concise but descriptive. 
Do not include the order ID, date, or price. 
Output ONLY the summary text.

Items:
${joinedItems}`;

    try {
        const result = await client.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                temperature: 0.2,
                topK: 1,
                topP: 1,
                maxOutputTokens: 150,
                safetySettings: [
                    {
                        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                    },
                ]
            }
        });
        const summary = result.candidates[0].content.parts[0].text.trim();
        return summary;
    } catch (error) {
        console.error("Error summarizing with Gemini:", error);
        return joinedItems; // Fallback to joined items on error
    }
}

const args = process.argv.slice(2);

if (args.length < 1) {
    console.log('usage: node app.js orderFile');
    process.exit(1);
}
const orderFile = args[0];
console.log('Orders file: ' + orderFile);
readToList(orderFile).then(async function(orders) {
    const ynabTransactions = [];
    for (const order of orders) {
        if (!order['order id'].startsWith("D01") && order['order id'] !== 'order id' && !order['order id'].includes("=SUBTOTAL")) {
            const transactions = await convertToYnabTransaction(order);
            ynabTransactions.push(...transactions.filter(t => t['amount'] !== 0));
        }
    }

    await ynab.createTransactions(ynabTransactions);
    ynab.getTransactions('2023-07-01').then(function(transactions) {
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

async function convertToYnabTransaction(order) {
    const orderDate = order['date'];
    let amount = Math.round(-(Number(order['total'].replace('$', '')) + Number(order['gift'].replace('$', ''))) * 1000);

    const payee = 'Amazon';
    const payee_id = '0462e71e-45c2-4a9b-8a06-b25b137ecc58';

    const transactions = [];

    const importId = order['order id'];
    const itemTitles = order['items'].split(';').map(item => item.trim()).filter(item => item !== '');
    const itemCount = itemTitles.length;
    const itemSummary = await summarizeItemsWithGemini(itemTitles);
    const baseMemo = `${order['order id']} (${itemCount} items) - `;
    const maxSummaryLength = 500 - baseMemo.length;
    const finalItemSummary = itemSummary.substring(0, maxSummaryLength);

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
            'payee_id': payee_id,
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
        'payee_id': payee_id,
        'import_id': importId,
        'memo': `${baseMemo}${finalItemSummary}`,
        'cleared': 'cleared'
    });

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
