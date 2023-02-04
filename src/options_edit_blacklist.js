const SETTINGS_BLACKLIST_ELEMENTS = 'blacklist-elems';

document
    .getElementById("blacklist-open-btn")
    .addEventListener("click", async function (event) {
        event.preventDefault();
        let currSettings = {}
        try {
            currSettings = await chrome?.storage?.local?.get(SETTINGS_STORAGE_KEY);
        } catch (err) {
            console.error(err);
            location.reload();
        }

        if (blacklist = currSettings[SETTINGS_STORAGE_KEY][SETTINGS_BLACKLIST_ELEMENTS]) {
            for (const item of blacklist) {
                addTextBox(...item)
            }
        }
        document.getElementById("blacklist-popup").style.display = "block";
    });

document
    .getElementById("blacklist-cancel-btn")
    .addEventListener("click", function (event) {
        event.preventDefault();
        document.getElementById("blacklist-popup").style.display = "none";
        clearTextBox()
    });

document
    .getElementById("blacklist-add-btn")
    .addEventListener("click", function (event) {
        event.preventDefault();
        addTextBox();
    });

document
    .getElementById("blacklist-remove-btn")
    .addEventListener("click", function (event) {
        event.preventDefault();
        removeTextBox();
    });

document
    .getElementById("blacklist-save-btn")
    .addEventListener("click", async function (event) {
        const blacklist = []
        const col1 = document.querySelectorAll('.blacklist-column1 input')
        const col2 = document.querySelectorAll('.blacklist-column2 input')
        const minLength = Math.min(col1.length, col2.length)
        for (let i = 0; i < minLength; i++) {
            blacklist.push([col1[i].value, col2[i].value])
        }
        try {
            const currSettings = await chrome?.storage?.local?.get(SETTINGS_STORAGE_KEY);
            currSettings[SETTINGS_STORAGE_KEY][SETTINGS_BLACKLIST_ELEMENTS] = blacklist
            await chrome.storage.local.set(currSettings);
            location.reload();
        } catch (err) {
            console.error(err);
        }
    });

function addTextBox(col1, col2) {
    var column1 = document.createElement("div");
    column1.className = "blacklist-column1";
    var column2 = document.createElement("div");
    column2.className = "blacklist-column2";
    var attrNameTextBox = document.createElement("input");
    attrNameTextBox.type = "text";
    attrNameTextBox.name = "attribute_name";
    attrNameTextBox.placeholder = "Attribute Name";
    attrNameTextBox.setAttribute("required", "required");
    attrNameTextBox.value = col1 || "";
    var blacklistValueTextBox = document.createElement("input");
    blacklistValueTextBox.type = "text";
    blacklistValueTextBox.name = "blacklist_value";
    blacklistValueTextBox.placeholder = "Blacklist Value";
    blacklistValueTextBox.setAttribute("required", "required");
    blacklistValueTextBox.value = col2 || "";
    column1.appendChild(attrNameTextBox);
    column2.appendChild(blacklistValueTextBox);
    document.getElementById("blacklist-textbox-area").appendChild(column1);
    document.getElementById("blacklist-textbox-area").appendChild(column2);
}

function removeTextBox() {
    const column1 = document.getElementsByClassName("blacklist-column1");
    const column2 = document.getElementsByClassName("blacklist-column2");
    const columns = [column1, column2];
    for (const column of columns) {
        if (column.length > 0) {
            const lastRow = column[column.length - 1];
            lastRow.parentNode.removeChild(lastRow);
        }
    }
}

function clearTextBox() {
    const node = document.getElementById("blacklist-textbox-area");
    while (node.firstChild) {
        node.removeChild(node.lastChild);
    }
}