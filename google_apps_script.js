/**
 * IMS Google Sheets Backend
 * -------------------------
 * 1. Paste this code into Extensions > Apps Script in your Google Sheet.
 * 2. Deploy as Web App -> Execute as: Me -> Who has access: Anyone.
 * 3. Copy the URL and paste it into your IMS Admin Panel.
 */

function doGet(e) {
    const lock = LockService.getScriptLock();
    lock.tryLock(10000);

    try {
        const data = getAllData();
        return ContentService
            .createTextOutput(JSON.stringify({ result: 'success', data: data }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (e) {
        return ContentService
            .createTextOutput(JSON.stringify({ result: 'error', error: e.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    } finally {
        lock.releaseLock();
    }
}

function doPost(e) {
    const lock = LockService.getScriptLock();
    lock.tryLock(10000);

    try {
        // Expecting JSON payload in body
        const p = JSON.parse(e.postData.contents);
        const action = p.action;

        if (action === 'sync_up') {
            // Full Sync from Client to Cloud (Overwrite/Merge)
            // For safety, we will just update specific records if provided, or full replace if specified
            // But for this simple system, let's process 'single_change' events usually
        }

        if (action === 'save_record') {
            // Save a single record (Create or Update)
            const sheetName = getSheetNameByKey(p.key);
            const record = p.data;
            if (sheetName && record) {
                saveRecord(sheetName, record);
            }
        }

        if (action === 'bulk_save') {
            // Replace entire sheet data (useful for initial migration or reset)
            const sheetName = getSheetNameByKey(p.key);
            const records = p.data; // Array
            if (sheetName && records) {
                overwriteSheet(sheetName, records);
            }
        }

        return ContentService
            .createTextOutput(JSON.stringify({ result: 'success' }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (e) {
        return ContentService
            .createTextOutput(JSON.stringify({ result: 'error', error: e.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    } finally {
        lock.releaseLock();
    }
}

// --- Helper Functions ---

const KEY_MAP = {
    'ims_users': 'Users',
    'ims_inventory': 'Inventory',
    'ims_sales': 'Sales',
    'ims_purchases': 'Purchases',
    'ims_expenses': 'Expenses',
    'ims_banner': 'Banner', // Special case, maybe store in a Config sheet
    'ims_vertical_banner': 'Banner'
};

function getSheetNameByKey(key) {
    return KEY_MAP[key] || null;
}

function getAllData() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const result = {};

    // Iterate over our known keys
    for (let key in KEY_MAP) {
        const sheetName = KEY_MAP[key];
        let sheet = ss.getSheetByName(sheetName);

        if (!sheet) {
            result[key] = []; // Empty if sheet doesn't exist
            continue;
        }

        if (sheetName === 'Banner') {
            // Key-Value store for banners
            const data = sheet.getDataRange().getValues();
            // Find row with key
            let val = '';
            // Simple approach: Row 1 = Horizontal, Row 2 = Vertical
            // Or better: Column A = Key, Column B = Value
            for (let i = 0; i < data.length; i++) {
                if (data[i][0] === key) val = data[i][1];
            }
            result[key] = val;
            continue;
        }

        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) { // Only header or empty
            result[key] = [];
            continue;
        }

        const headers = data[0];
        const rows = data.slice(1);

        const jsonArr = rows.map(row => {
            let obj = {};
            headers.forEach((h, i) => {
                if (h) obj[h] = row[i];
            });
            return obj;
        });

        result[key] = jsonArr;
    }

    return result;
}

function saveRecord(sheetName, record) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);

    // Create Sheet if missing
    if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        // Add headers based on record keys
        const headers = Object.keys(record);
        sheet.appendRow(headers);
    }

    // Banner special handling
    if (sheetName === 'Banner') {
        // record is { key: 'ims_banner', value: '...' }
        const data = sheet.getDataRange().getValues();
        let found = false;
        for (let i = 0; i < data.length; i++) {
            if (data[i][0] === record.key) {
                sheet.getRange(i + 1, 2).setValue(record.value);
                found = true;
                break;
            }
        }
        if (!found) sheet.appendRow([record.key, record.value]);
        return;
    }

    // Generic Handling
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const data = sheet.getDataRange().getValues();

    // Find ID column index
    const idIndex = headers.indexOf('id');
    if (idIndex === -1 && headers.length > 0) {
        // If no ID header, maybe it's a new sheet or headers mismatch
        // Just append?
        sheet.appendRow(headers.map(h => record[h] || ''));
        return;
    }

    // Update if ID exists
    let rowIndex = -1;
    if (record.id) {
        for (let i = 1; i < data.length; i++) {
            if (String(data[i][idIndex]) === String(record.id)) {
                rowIndex = i + 1;
                break;
            }
        }
    }

    const rowData = headers.map(h => {
        let val = record[h];
        // Convert array/objects to string if complex
        if (typeof val === 'object') val = JSON.stringify(val);
        return val || '';
    });

    if (rowIndex > -1) {
        // Update
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
        // Insert
        sheet.appendRow(rowData);
    }
}

function overwriteSheet(sheetName, records) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);

    if (sheet) {
        sheet.clear();
    } else {
        sheet = ss.insertSheet(sheetName);
    }

    if (records.length === 0) return;

    const headers = Object.keys(records[0]);
    sheet.appendRow(headers);

    const rows = records.map(r => headers.map(h => {
        let val = r[h];
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        return val || '';
    }));

    // Write in bulk
    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
}
