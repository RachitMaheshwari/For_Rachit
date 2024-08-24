//console.log = function() {};

function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].classList.remove("active");
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    const tab = document.getElementById(tabName);
    if (tab) {
        tab.classList.add("active");
    } else {
        console.error(`Tab with ID ${tabName} does not exist.`);
    }
    evt.currentTarget.className += " active";
}

function resetImportButton(fileInput) {
    console.log('Resetting import button...');
    fileInput.value = "";
    fileInput.classList.add('hidden');
    const importButton = fileInput.closest('.batchContent').querySelector('.importExcelBtn');
    if (importButton) {
        console.log('Found import button, resetting text...');
        importButton.textContent = 'Import via Excel';
        importButton.classList.remove('file-ready');
    } else {
        console.error('Import button not found!');
    }
}

let importedData = []; // Array to hold already imported data before the project is saved

window.importExcel = function(fileInput, shotsContainer) {
    let batchContent = shotsContainer.closest('.batchContent');
    let batchId;
    if (!batchContent) {
        addBatch();
        batchContent = shotsContainer.closest('.batchContent');
        batchId = batchCounter;
    } else {
        batchId = parseInt(batchContent.dataset.batchId, 10);
    }

    if (isNaN(batchId)) {
        console.error('Invalid batch ID when importing Excel data.');
        return;
    }   

    const file = fileInput.files[0];
    if (file) {
        const importButton = fileInput.closest('.batchContent').querySelector('.importExcelBtn');
        if (importButton) {
            importButton.textContent = 'File Ready. Click to Import';
            importButton.classList.add('file-ready');
            importButton.classList.remove('btn-primary'); // Assuming 'btn-primary' is the original class
            importButton.classList.add('btn-success'); // Assuming 'btn-success' is the green style
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                const headers = json[0];
                console.log("Excel headers:", headers);
    
                displayMappingUI(headers, batchId, (mapping, universalService, universalVendor) => {
                    console.log("Mapping:", mapping);
                    console.log("Universal Service:", universalService);
                    console.log("Universal Vendor:", universalVendor);
                    
                    applyMapping(json.slice(1), mapping, headers, shotsContainer, batchId, universalService, universalVendor);
                    resetImportButton(fileInput);
                });
            } catch (error) {
                console.error('Error processing Excel file:', error);
                alert('Error processing Excel file. Please check the console for details.');
                resetImportButton(fileInput);
            }
        };
        reader.onerror = function() {
            console.error('Error reading file');
            alert('Error reading file. Please try again.');
            resetImportButton(fileInput);
        };
        reader.readAsArrayBuffer(file);
    } else {
        if (!fileInput.classList.contains('hidden') && fileInput.files.length === 0) {
            const downloadLink = `<a href="#" id="downloadTemplate${batchId}" class="downloadTemplate">Download Import Template</a>`;
            alert(`Please upload an Excel file.\n${downloadLink}`);
        }
        fileInput.classList.remove('hidden');
    }
}

function checkForDuplicates(newData, existingData) {
    let duplicates = [];   
    
    // Assuming you have a cachedServices object that maps service IDs to their names
    const serviceMap = window.cachedServices.reduce((map, service) => {
        map[service.id] = service.name;
        return map;
    }, {});

    newData.forEach(newRow => {        
        let isDuplicateInExisting = existingData.some(existingRow => 
            existingRow['Shot Name'] === newRow['Shot Name'] && 
            existingRow['Frame Count'] === newRow['Frame Count'] &&
            (existingRow['Service'] === newRow['Service'] || 
             (!existingRow['Service'] && !newRow['Service']))
        );

        let isDuplicateInNew = newData.filter(row => 
            row['Shot Name'] === newRow['Shot Name'] && 
            row['Frame Count'] === newRow['Frame Count'] &&
            (row['Service'] === newRow['Service'] || 
             (!row['Service'] && !newRow['Service']))
        ).length > 1;

        if (isDuplicateInExisting || isDuplicateInNew) {
            const serviceName = serviceMap[newRow['Service']] || 'undefined';
            duplicates.push(`Shot Name: ${newRow['Shot Name']}, Frame Count: ${newRow['Frame Count']}, Service: ${serviceName}`);
        }
    });

    return duplicates;
}

// Allow drop function
window.allowDrop = function(event) {
    event.preventDefault();
    const batchContent = event.target.closest('.batchContent');
    if (batchContent) {
        batchContent.classList.add('highlighted');
    }
}

function showCustomAlert(message) {
    const modal = document.getElementById("customAlertModal");
    const modalMessage = document.getElementById("modalMessage");
    modalMessage.innerHTML = message;
    modal.style.display = "block";

    const closeModal = document.getElementById("closeModal");
    closeModal.onclick = function() {
        modal.style.display = "none";
    };

    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    };
}

// Handle drop function
window.handleDrop = function(event) {
    event.preventDefault();
    const batchContent = event.target.closest('.batchContent');
    if (!batchContent) {
        console.error('Drop target is not within a .batchContent element');
        return;
    }

    const fileInput = batchContent.querySelector('.excelFileInput');    
    const importButton = batchContent.querySelector('.importExcelBtn');
    
    if (!fileInput || !importButton) {
        console.error('Could not find required elements within the batch content');
        return;
    }

    if (event.dataTransfer.files.length > 0) {
        fileInput.files = event.dataTransfer.files;
        fileInput.classList.remove('hidden');
        importButton.textContent = 'File ready. Click to import';
        importButton.classList.add('file-ready');
        console.log("File dropped. Button state:", importButton.textContent);
    } else {
        console.error('No files were dropped');
    }

    // Remove the highlight after drop
    batchContent.classList.remove('highlighted');
};

window.removeHighlight = function(event) {
    const batchContent = event.target.closest('.batchContent');
    if (batchContent) {
        batchContent.classList.remove('highlighted');
    }
};


document.addEventListener('dragleave', window.removeHighlight);


document.addEventListener('DOMContentLoaded', function() {
    const socket = io('http://localhost:3000');
    let totalCost = 0;
    let batchCounter = 0; // Initialize a counter for the batch names
    let cachedVendors = null;
    window.cachedServices = null;

    // Setup event listeners and initial functions
    setupEventListeners();
    fetchClients();
    fetchServices(); // Fetch services on page load
    fetchProjects(); // Fetch projects on page load

    function setupEventListeners() {
        const projectForm = document.getElementById('projectForm');
        projectForm?.addEventListener('submit', saveProject);

        const projectDateInput = document.getElementById('projectDate');
        const addBatchBtn = document.getElementById('addBatchBtn');

        // Enable the "Add New Batch" button only when a valid Project Date is entered
        addBatchBtn.addEventListener('click', function() {
            if (!projectDateInput.value) {
                alert('Please set the Project Date before adding a new batch.');
                return; // Exit if project date is not set
            }

            addBatch(); // Proceed to add batch if project date is set
        });

        const clientSelect = document.getElementById('clientName');
        clientSelect?.addEventListener('change', updateProjectRowColor);

        const newProjectButton = document.getElementById('newProjectButton');
        newProjectButton.addEventListener('click', function() {
            resetFormAndUI();
            projectForm.reset();
            document.getElementById('projectId').value = ''; // Clear project ID to indicate a new entry
            projectFormContainer.style.display = 'block'; // Ensure the form is visible            
        });

        // Adding event listener for file input change to handle the "File Ready" button text and style
        const fileInputs = document.querySelectorAll('.excelFileInput'); // Adjust the selector if necessary
        fileInputs.forEach(fileInput => {
            fileInput.addEventListener('change', function() {
                const importButton = fileInput.closest('.batchContent').querySelector('.importExcelBtn');
                if (fileInput.files.length > 0) {
                    importButton.textContent = 'File Ready. Click to Import';
                    importButton.classList.add('file-ready');
                    importButton.classList.remove('btn-primary'); // Assuming 'btn-primary' is the original class
                    importButton.classList.add('btn-success'); // Assuming 'btn-success' is the green style
                } else {
                    importButton.textContent = 'Import via Excel';
                    importButton.classList.remove('file-ready');
                    importButton.classList.remove('btn-success'); // Remove green style if no file is selected
                    importButton.classList.add('btn-primary'); // Revert to original button style
                }
            });
        });

        // Adding event listener to set the minimum selectable date for Batch Date
        document.getElementById('batchesContainer').addEventListener('focusin', function(event) {
            if (event.target.matches('input[type="date"]')) {
                const batchDateInput = event.target;
                const projectDateInput = document.getElementById('projectDate');
                const projectDateValue = projectDateInput.value;

                // Set the minimum selectable date to the project date
                batchDateInput.setAttribute('min', projectDateValue);
            }
        });

    // Delegating events for dynamically added elements
    document.addEventListener('click', function(e) {
        if (e.target.className.includes('importExcelBtn')) {
            const fileInput = e.target.closest('.batchContent').querySelector('.excelFileInput');
            const shotsContainer = e.target.closest('.batchContent').querySelector('.shotsContainer');
            if (fileInput && shotsContainer) {
                if (fileInput.files.length === 0) {
                    const batchContent = e.target.closest('.batchContent');
                    const batchId = batchContent ? parseInt(batchContent.dataset.batchId, 10) : null;
                    const downloadLink = `<a href="#" id="downloadTemplate${batchId}" class="downloadTemplate">Download Import Template</a>`;
                    showCustomAlert(`Please upload an Excel file.<br>${downloadLink}`);
                } else {
                    importExcel(fileInput, shotsContainer);
                }
            }        
        } else if (e.target.matches('[data-action="addShot"]')) {
            const batchContent = e.target.closest('.batchContent');
            const batchId = batchContent ? parseInt(batchContent.dataset.batchId, 10) : null;
            addShot(batchContent.querySelector('.shotsContainer'), batchId);
        } else if (e.target.matches('[data-action="finalizeBatch"]')) {
            const batchContent = e.target.closest('.batchContent');
            finalizeBatch(batchContent);
        } else if (e.target.className.includes('deleteShotBtn')) {
            deleteShot(e.target);
        } else if (e.target.tagName.toLowerCase() === 'h3' && e.target.parentNode.classList.contains('batch')) {
            toggleBatchContent(e.target);
        } else if (e.target.classList.contains('downloadTemplate')) {
            const template = [
                ["Shot Name", "Frame Count", "Client Cost", "Vendor Cost"]  // Add additional fields if needed
            ];
            const ws = XLSX.utils.aoa_to_sheet(template);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Template");
            XLSX.writeFile(wb, "import_template.xlsx");
        }
    });

    document.getElementById('deleteSelectedButton').addEventListener('click', function() {
        const selectedCheckboxes = document.querySelectorAll('.project-checkbox:checked');
        const idsToDelete = Array.from(selectedCheckboxes).map(checkbox => checkbox.value);

        if (idsToDelete.length === 0) {
            alert('No projects selected for deletion.');
            return;
        }

        if (confirm('Are you sure you want to delete the selected projects?')) {
            idsToDelete.forEach(id => deleteProject(id));
        }
    });

        // Set default open tab
        document.querySelector('.tablinks').click();
    }


    function fetchClients() {
        console.log("Fetching clients from the server...");
        fetch('/api/companies')
            .then(response => response.json())
            .then(companies => {
                const clientSelect = document.getElementById('clientName');
                clientSelect.innerHTML = '';
                companies.forEach(company => {
                    const option = new Option(company.name, company.id);
                    option.dataset.type = company.type;
                    clientSelect.add(option);
                });
                updateProjectRowColor(); // Initial color update after fetching clients
            })
            .catch(error => console.error('Error fetching companies:', error));
    }

    function updateProjectRowColor() {
        console.log("Changing project details color..."); // Debug statement
        const clientSelect = document.getElementById('clientName');
        const projectDetailsRow = document.getElementById('projectDetails');
        const selectedOption = clientSelect.options[clientSelect.selectedIndex];
        if (selectedOption && projectDetailsRow) {
            const clientType = selectedOption.dataset.type;
            projectDetailsRow.className = 'project-row'; // Reset to default and then add type-specific class
            if (clientType === 'international') {
                projectDetailsRow.classList.add('international');
            } else {
                projectDetailsRow.classList.add('domestic');
            }
        }
    }      
    
    function fetchProjects() {
        fetch('/api/projects')
            .then(response => response.json())
            .then(projects => {
                const projectList = document.getElementById('projectList');
                projectList.innerHTML = ''; // Clear existing list items if any

                projects.forEach(project => {
                    const listItem = document.createElement('li');
                    listItem.id = 'project-' + project.id;

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.classList.add('project-checkbox');
                    checkbox.value = project.id;

                    const projectName = document.createElement('span');
                    projectName.textContent = project.name;
                    projectName.onclick = function() { editProjectDetails(project.id); };

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Delete';
                    deleteButton.classList.add('delete-project');
                    deleteButton.onclick = function() { deleteProject(project.id); };

                    listItem.appendChild(checkbox);
                    listItem.appendChild(projectName);
                    listItem.appendChild(deleteButton);

                    projectList.appendChild(listItem);
                });

                // Reset the form and UI elements
                resetFormAndUI();
            })
            .catch(error => {
                console.error('Error fetching projects:', error);
            });
    }

    function deleteProject(id) {
        fetch(`/api/projects/${id}`, { method: 'DELETE' })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                fetchProjects(); // Refresh the projects list
            })
            .catch(error => console.error('Error deleting project:', error));
    }

    function resetFormAndUI() {
        const projectForm = document.getElementById('projectForm');
        projectForm.reset(); // Reset the form fields

        // Clear any dynamic fields or UI elements
        const batchesContainer = document.getElementById('batchesContainer');
        batchesContainer.innerHTML = ''; // Clear existing batch fields
    }    
    
    function addBatch() {
        batchCounter++; // Increment only when creating a new batch from the UI, not when loading existing ones
        console.log(`New batch created. Batch counter: ${batchCounter}`);
        const addBatchBtn = document.getElementById('addBatchBtn');
        addBatchBtn.style.display = 'none';
    
        const batchesContainer = document.getElementById('batchesContainer');
        const batchContainer = document.createElement('div');
        batchContainer.classList.add('batch');
        batchContainer.id = `batch${batchCounter}`; // Ensure each batch has a unique ID
        batchContainer.innerHTML = `
            <h3>Batch ${batchCounter} ▼</h3>
            <div class="batchContent" data-batch-id="${batchCounter}" ondrop="handleDrop(event)" ondragover="allowDrop(event)" ondragleave="removeHighlight(event)">
                <label for="batchDate${batchCounter}">Batch Date:</label>
                <input type="date" id="batchDate${batchCounter}" required>                
                <div class="shotsContainer" id="shotsContainer${batchCounter}"></div>
                <div class="buttonContainer">
                    <input type="file" class="excelFileInput hidden" accept=".xlsx, .xls">
                    <button type="button" class="importExcelBtn" id="importButton${batchCounter}">Import via Excel</button>                    
                    <button type="button" data-action="addShot">Add New Shot</button>
                    <button type="button" data-action="finalizeBatch">Finalize Batch</button>
                    <button type="button" class="toggleBulkEdit">Toggle Bulk Edit</button>
                    <div class="bulkEditControls" style="display:none;">
                        <select id="columnToEdit${batchCounter}">
                            <option value="Shot Name">Shot Name</option>
                            <option value="Frame Count">Frame Count</option>
                            <option value="Services">Services</option>
                            <option value="Client Cost">Client Cost</option>
                            <option value="Vendor Cost">Vendor Cost</option>
                            <option value="Vendor Name">Vendor Name</option>
                        </select>
                        <input type="text" id="newValue${batchCounter}" placeholder="New Value">
                        <button>Apply Changes</button>
                    </div>                    
                </div>
            </div>
        `;
        batchesContainer.appendChild(batchContainer);

        // Event listeners for the new batch
        const importButton = document.getElementById(`importButton${batchCounter}`);
        const fileInput = batchContainer.querySelector('.excelFileInput');
        importButton.addEventListener('click', function () {
            if (fileInput.files.length > 0) {
                importExcel(fileInput, batchContainer.querySelector('.shotsContainer'));
            } else if (fileInput.classList.contains('hidden')) {
                fileInput.classList.remove('hidden');
                importButton.textContent = 'Select a file';
            } else {
                alert("Please select an Excel file.");
            }
        });
        
        const toggleButton = batchContainer.querySelector('.toggleBulkEdit');
        toggleButton.addEventListener('click', () => toggleBulkEditControls(batchCounter));

        const shotsContainer = batchContainer.querySelector('.shotsContainer');
        updateButtonVisibility(shotsContainer);

        const applyChangesBtn = batchContainer.querySelector('.bulkEditControls button');
        applyChangesBtn.addEventListener('click', () => {
            applyBulkEdit(batchCounter);
        });

        // Store the batch ID in a data attribute on the .batchContent element
        batchContainer.querySelector('.batchContent').dataset.batchId = batchCounter;
        console.log(`Batch ${batchCounter} created with data-batch-id:`, batchContainer.querySelector('.batchContent').dataset.batchId);
    }

    function fetchVendorsForBatch(batchId) {
        if (!batchId) {
            console.error('Batch ID is undefined. Cannot fetch vendors for an undefined batch.');
            return Promise.reject(new Error('Batch ID is undefined.'));
        }

        console.log(`fetchVendorsForBatch called with batchId: ${batchId}`);
        return new Promise((resolve, reject) => {
            console.log(`Fetching vendors for batch ${batchId}`);
    
            if (window.cachedVendors) {
                console.log('Using cached vendors:', window.cachedVendors);
                resolve(window.cachedVendors);
            } else {
                console.log('Fetching vendors from server...');
                fetch('/api/vendors')
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(vendors => {
                        window.cachedVendors = vendors;
                        console.log('Vendors data cached:', window.cachedVendors);
                        resolve(vendors);
                    })
                    .catch(error => {
                        console.error(`Error fetching vendors for batch ${batchId}:`, error);
                        reject(error);
                    });
            }
        });
    }
    
    function populateVendorDropdownForBatch(batchId, vendors, resolve, reject) {
        const vendorSelect = document.getElementById(`batchVendor${batchId}`);
        if (vendorSelect) {
            populateVendorDropdown(vendorSelect, vendors);
            resolve(vendors);
        } else {
            console.error(`Vendor select element with ID 'batchVendor${batchId}' is null. Cannot populate.`);
            reject(new Error(`Vendor select element with ID 'batchVendor${batchId}' is null. Cannot populate.`));
        }
    }


      

    function toggleBatchContent(context) {
        // Find the .shotsContainer within the same .batch container as the clicked header
        const shotsContainer = context.nextElementSibling;
    
        // Toggle visibility
        if (shotsContainer.style.display === 'none') {
            shotsContainer.style.display = 'block'; // Show the container
            context.textContent = context.textContent.replace('▼', '▲'); // Change the symbol to indicate expanded state
        } else {
            shotsContainer.style.display = 'none'; // Hide the container
            context.textContent = context.textContent.replace('▲', '▼'); // Change the symbol to indicate collapsed state
        }
    }

    function finalizeBatch(batchContent, skipConfirmation = false) {
        // Show a confirmation prompt
        if (!skipConfirmation && !confirm("Are you sure you want to finalize this batch? This will lock all fields and hide the buttons.")) {
            return; // Exit if the user cancels
        }

        // Finalize the batch, preventing further modifications
        const batchDateInput = batchContent.querySelector('input[type="date"]');
        
        if (!batchDateInput || !batchDateInput.value) {
            alert("Please fill in the batch date.");
            return;
        }

        const dateDisplay = document.createElement('span');
        dateDisplay.textContent = batchDateInput.value; // Store only the date value
        dateDisplay.setAttribute('data-original-date', batchDateInput.value); // Store the original date as a data attribute
        batchDateInput.parentNode.replaceChild(dateDisplay, batchDateInput);

        //batchContent.querySelector('label').remove(); // Remove the label as it's no longer needed

        // Disable all input fields in the shots container
        const inputs = batchContent.querySelectorAll('input, select');
        inputs.forEach(input => input.disabled = true);

        // Hide all buttons except "Edit Batch"
        const buttons = batchContent.querySelectorAll('button');
        buttons.forEach(button => {
            if (button.textContent !== "Edit Batch") {
                button.style.display = 'none';
            }
        });

        // Add the "Edit Batch" button
        let editBatchBtn = batchContent.querySelector('.editBatchBtn');
        if (!editBatchBtn) {
            editBatchBtn = document.createElement('button');
            editBatchBtn.textContent = 'Edit Batch';
            editBatchBtn.classList.add('editBatchBtn');
            batchContent.appendChild(editBatchBtn);

            editBatchBtn.addEventListener('click', () => editBatch(batchContent));
        }

        const finalizeBtn = batchContent.querySelector('[data-action="finalizeBatch"]');
        if (finalizeBtn) {
            finalizeBtn.style.display = 'none';
        }

        const addBatchBtn = document.getElementById('addBatchBtn');
        addBatchBtn.style.display = 'inline-block'; // Show the "Add New Batch" button again

        // Set the isFinalized data attribute to true to track the finalized state
        batchContent.dataset.isFinalized = true; // This ensures it's set for this batch
    }

    function editBatch(batchContent) {
        // Replace static text with input field if necessary
        const dateDisplay = batchContent.querySelector('span[data-original-date]');
        if (dateDisplay) {
            const originalDate = dateDisplay.getAttribute('data-original-date');
            
            // Ensure the dateText is correctly extracted
            if (originalDate) {
                const dateInput = document.createElement('input');
                dateInput.type = 'date';
                dateInput.required = true;

                // Directly assign the dateText to the input value
                dateInput.value = originalDate;

                // Replace the span with the input field
                dateDisplay.parentNode.replaceChild(dateInput, dateDisplay);
            } else {
                console.error('Failed to retrieve original date from span element.');
            }
        } else {
            console.error('Date span element not found.');
        }

        // Re-enable all input fields
        const inputs = batchContent.querySelectorAll('input, select');
        inputs.forEach(input => input.disabled = false);
    
        // Show all buttons
        const buttons = batchContent.querySelectorAll('button');
        buttons.forEach(button => {
            if (button.textContent !== "Edit Batch") {
                button.style.display = 'inline-block';
            }
        });

        // Show the "Finalize Batch" button
        let finalizeBatchBtn = batchContent.querySelector('[data-action="finalizeBatch"]');
        if (!finalizeBatchBtn) {
            finalizeBatchBtn = document.createElement('button');
            finalizeBatchBtn.textContent = 'Finalize Batch';
            finalizeBatchBtn.setAttribute('data-action', 'finalizeBatch');
            finalizeBatchBtn.style.display = 'inline-block';  // Ensure it is visible
            batchContent.appendChild(finalizeBatchBtn);

            finalizeBatchBtn.addEventListener('click', () => finalizeBatch(batchContent));
        } else {
            finalizeBatchBtn.style.display = 'inline-block';
        }
    
        // Hide the "Edit Batch" button
        const editBatchBtn = batchContent.querySelector('.editBatchBtn');
        if (editBatchBtn) {
            editBatchBtn.remove();
        }

        // Update the visibility of the buttons after editing
        const shotsContainer = batchContent.querySelector('.shotsContainer');
        updateButtonVisibility(shotsContainer);
    }

    function populateVendorDropdown(vendorSelect, vendors) {
        if (!vendorSelect) {
            console.error('Vendor select element is null. Cannot populate.');
            return;
        }

        console.log('Populating vendor dropdown:', vendorSelect.id);
        console.log('Vendors:', vendors);

        // Preserve the "Select Vendor" option
        const placeholderOption = vendorSelect.querySelector('option[value=""]') ? vendorSelect.querySelector('option[value=""]').outerHTML : '<option value="">Select Vendor</option>';

        // Clear existing options except the placeholder
        vendorSelect.innerHTML = placeholderOption;

        if (vendors.length === 0) {
            console.warn('No vendors available to populate the dropdown.');
            const emptyOption = new Option('No vendors available', '');
            vendorSelect.add(emptyOption);
        } else {
            vendors.forEach(vendor => {
                const option = new Option(vendor.name, vendor.id);
                vendorSelect.appendChild(option);
            });
        }

        // Disable the "Select Vendor" option once a vendor is selected
        vendorSelect.addEventListener('change', function () {
            if (vendorSelect.value) {
                vendorSelect.querySelector('option[value=""]').disabled = true;
            }
        });

        console.log('Vendor dropdown populated:', vendorSelect.innerHTML);
    }

    function populateServicesDropdown(serviceSelect, services) {
        if (!serviceSelect) {
            console.error('Service select element is null. Cannot populate.');
            return;
        }
    
        // Clear existing options
        serviceSelect.innerHTML = '';
    
        if (services.length === 0) {
            console.warn('No services available to populate the dropdown.');
            const emptyOption = new Option('No services available', '');
            serviceSelect.add(emptyOption);
        } else {
            const placeholderOption = new Option('Select Service', '');
            serviceSelect.add(placeholderOption);
    
            services.forEach(service => {
                const option = new Option(service.name, service.id);
                serviceSelect.add(option);
            });
        }

        console.log("Populated service dropdown:", serviceSelect.innerHTML);
    }

    function updateButtonVisibility(shotsContainer) {
        const shotsTable = shotsContainer.querySelector('table');
        const shotsCount = shotsTable ? shotsTable.rows.length - 1 : 0; // Subtract 1 to exclude header row
    
        const finalizeButton = shotsContainer.closest('.batchContent').querySelector('[data-action="finalizeBatch"]');
        const toggleBulkEditButton = shotsContainer.closest('.batchContent').querySelector('.toggleBulkEdit');
    
        if (shotsCount >= 1) {
            finalizeButton.style.display = 'inline-block';
        } else {
            finalizeButton.style.display = 'none';
        }
    
        if (shotsCount > 1) {
            toggleBulkEditButton.style.display = 'inline-block';
        } else {
            toggleBulkEditButton.style.display = 'none';
        }
    }
    
    
    function addShot(shotsContainer, batchId) {
        if (shotsContainer) {
            console.log(`Adding shot for batchId: ${batchId}`);
            let table = shotsContainer.querySelector('table');
            if (!table) {
                table = document.createElement('table');
                table.style.display = ''; // Ensure table is visible
                const headerRow = table.insertRow();
                headerRow.insertCell().textContent = ''; // For checkbox
                headerRow.insertCell().textContent = 'Shot Name';
                headerRow.insertCell().textContent = 'Frame Count'; // Moved up
                headerRow.insertCell().textContent = 'Services'; // Add Services column
                headerRow.insertCell().textContent = 'Client Cost'; // New Client Cost column
                headerRow.insertCell().textContent = 'Vendor Cost';                
                headerRow.insertCell().textContent = 'Vendor'; // Changed from Vendor Name                
                headerRow.insertCell().textContent = 'Actions';
                shotsContainer.insertBefore(table, shotsContainer.firstChild);
            }
    
            const row = table.insertRow(-1);
            const checkboxCell = row.insertCell();
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'edit-checkbox';
            checkboxCell.appendChild(checkbox);

            row.insertCell().innerHTML = `<input type="text" placeholder="Shot Name" required value="Default Name">`;
            row.insertCell().innerHTML = `<input type="number" placeholder="Frame Count" min="0" required value="0">`; // Moved up
            
            // Services dropdown
            const serviceCell = row.insertCell();
            const serviceSelect = document.createElement('select');
            serviceSelect.className = 'service-dropdown';
            const servicePlaceholderOption = document.createElement('option');
            servicePlaceholderOption.value = "";
            servicePlaceholderOption.textContent = "Select Service";
            serviceSelect.appendChild(servicePlaceholderOption);

            serviceSelect.addEventListener('change', function () {
                servicePlaceholderOption.disabled = true;
            });

            serviceCell.appendChild(serviceSelect);

            // Fetch services and populate the dropdown
            fetchServices()
                .then(services => {
                    services.forEach(service => {
                        const option = document.createElement('option');
                        option.value = service.id;
                        option.textContent = service.name;
                        serviceSelect.appendChild(option);
                    });
                })
                .catch(error => console.error('Error fetching services:', error));  

                row.insertCell().innerHTML = `<input type="number" placeholder="Client Cost" min="0" required value="0">`; // New Client Cost field
                row.insertCell().innerHTML = `<input type="number" placeholder="Vendor Cost" min="0" required value="0">`;

            // Vendor dropdown instead of input
            const vendorCell = row.insertCell();
            const vendorSelect = document.createElement('select');
            vendorSelect.className = 'vendor-dropdown';
            vendorSelect.id = `batchVendor${batchId}`;  // Ensuring the ID matches what fetchVendorsForBatch expects

            // Add "Select Vendor" option
            const vendorPlaceholderOption = document.createElement('option');
            vendorPlaceholderOption.value = "";
            vendorPlaceholderOption.textContent = "Select Vendor";
            vendorSelect.appendChild(vendorPlaceholderOption);

            vendorSelect.addEventListener('change', function () {
                vendorPlaceholderOption.disabled = true;
            });

            vendorCell.appendChild(vendorSelect); 

            if (batchId !== null) {
                console.log(`Fetching vendors for batch ${batchId}...`);
                fetchVendorsForBatch(batchId)
                    .then(vendors => {
                        populateVendorDropdown(vendorSelect, vendors);
                    })
                    .catch(error => {
                        console.error('Error fetching vendors:', error);
                        populateVendorDropdown(vendorSelect, []); // Pass an empty array to handle errors
                    });
            } else {
                console.error('Unable to determine batch ID for the new shot.');
            }
            row.insertCell().innerHTML = `<button type="button" class="deleteShotBtn">Delete</button>`;
    
            updateTotalCost(shotsContainer); // Update the total cost to include the new shot

            // After adding a shot, update the visibility of the buttons
            updateButtonVisibility(shotsContainer);
        }
    }

    function fetchServices() {
        return new Promise((resolve, reject) => {
            if (window.cachedServices) {
                console.log("Using cached services:", window.cachedServices);
                resolve(window.cachedServices);
            } else {
                fetch('/api/services')
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(services => {
                        window.cachedServices = services;
                        console.log("Fetched and cached services:", services);
                        resolve(services);
                    })
                    .catch(error => {
                        console.error('Error fetching services:', error);
                        reject(error);
                    });
            }
        });
    }
    
    function deleteShot(button) {
        const shotRow = button.closest('tr'); // Locate the nearest ancestor <tr> element
        const shotsContainer = button.closest('.shotsContainer'); // Find the shotsContainer to update total cost        
        if (shotRow) {
            shotRow.remove(); // Remove the entire row from the DOM            
            updateTotalCost(shotsContainer); // Update the total cost
            updateButtonVisibility(shotsContainer); // Update button visibility
        }
    
        // Check if any rows are left, excluding the header row
        const table = shotsContainer.querySelector('table');
        if (table && table.rows.length <= 1) { // Only header row remains
            table.style.display = 'none'; // Hide the table
        }
    }

    function importExcel(fileInput, shotsContainer) {
        let batchContent = shotsContainer.closest('.batchContent');
        let batchId;
        if (!batchContent) {
            addBatch(); // This should create a new batch and set batchCounter
            batchContent = shotsContainer.closest('.batchContent');
            batchId = batchCounter;
        } else {
            batchId = parseInt(batchContent.dataset.batchId, 10);
        }
    
        if (isNaN(batchId)) {
            console.error('Invalid batch ID when importing Excel data.');
            return;
        }   
    
        const file = fileInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Read raw data
    
                // Display mapping UI
                const headers = json[0]; // First row contains headers
                displayMappingUI(headers, batchId, (mapping, universalService, universalVendor) => {
                    applyMapping(json.slice(1), mapping, headers, shotsContainer, batchId, universalService, universalVendor); // Skip header row

                    // Reset the file input and hide it after import
                    fileInput.value = "";
                    fileInput.classList.add('hidden');
                });
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Only show the alert if the file input is visible and no file is selected
            if (!fileInput.classList.contains('hidden') && fileInput.files.length === 0) {
                alert("Please upload an Excel file.");
            }
            fileInput.classList.remove('hidden');
        }
    }
    
    function displayMappingUI(headers, batchId, callback) {
        const mappingContainer = document.getElementById('mappingContainer');
        if (!mappingContainer) {
            console.error('Mapping container not found');
            return;
        }
        mappingContainer.innerHTML = ''; // Clear any previous mappings
    
        const fields = ['Shot Name', 'Frame Count', 'Client Cost', 'Vendor Cost'];
        headers.forEach((header, index) => {
            const select = document.createElement('select');
            select.id = `mapping${index}`;
            select.innerHTML = `<option value="">Select Mapping</option>`;
            fields.forEach(field => {
                select.innerHTML += `<option value="${field}">${field}</option>`;
            });
            mappingContainer.appendChild(document.createTextNode(header));
            mappingContainer.appendChild(select);
            mappingContainer.appendChild(document.createElement('br'));
        });

        // Populate universal dropdowns
        const serviceSelect = document.getElementById('universalServiceSelect');
        if (serviceSelect) {
            fetchServices().then(services => {
                populateServicesDropdown(serviceSelect, services);
            }).catch(error => console.error('Error fetching services:', error));
        } else {
            console.error('Universal service select not found');
        }

        const vendorSelect = document.getElementById('universalVendorSelect');
        if (vendorSelect) {
            fetchVendorsForBatch(batchId).then(vendors => {
                populateVendorDropdown(vendorSelect, vendors);
            }).catch(error => console.error('Error fetching vendors:', error));
        } else {
            console.error('Universal vendor select not found');
        }
    
        const confirmBtn = document.getElementById('confirmMappingBtn');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                const mapping = {};
                headers.forEach((header, index) => {
                    const selectedField = document.getElementById(`mapping${index}`).value;
                    if (selectedField) {
                        mapping[header] = selectedField;
                    }
                });

                const universalService = serviceSelect ? serviceSelect.value : null;
                const universalVendor = vendorSelect ? vendorSelect.value : null;

                if (confirm('Are you sure the mapping is correct?')) {
                    callback(mapping, universalService, universalVendor);
                    const mappingModal = document.getElementById('mappingModal');
                    if (mappingModal) {
                        mappingModal.style.display = 'none';
                    }
                }
            };
        } else {
            console.error('Confirm mapping button not found');
        }

        const closeBtn = document.getElementById('closeMappingModal');
        if (closeBtn) {
            closeBtn.onclick = () => {
                const mappingModal = document.getElementById('mappingModal');
                if (mappingModal) {
                    mappingModal.style.display = 'none';
                }
            };
        } else {
            console.error('Close mapping modal button not found');
        }

        // Show the modal
        const mappingModal = document.getElementById('mappingModal');
        if (mappingModal) {
            mappingModal.style.display = 'block';
        } else {
            console.error('Mapping modal not found');
        }
    }
    
    function applyMapping(data, mapping, headers, shotsContainer, batchId, universalService, universalVendor) {
        // Step 1: Map the data based on the provided mapping
        let newData = data.map(row => {
            let mappedRow = {};
            headers.forEach((header, index) => {
                if (mapping[header]) {
                    mappedRow[mapping[header]] = row[index] || null; // Use null instead of undefined
                }
            });
            // If no service is mapped, use the universal service
            if (!mappedRow['Service'] && universalService) {
                mappedRow['Service'] = universalService;
            }
            return mappedRow;
        });

        // Validate numeric columns
        let invalidRows = newData.filter(row => {
            return isNaN(row['Frame Count']) || isNaN(row['Client Cost']) || isNaN(row['Vendor Cost']);
        });

        if (invalidRows.length > 0) {
            alert('Error: Some rows have non-numeric values in numeric columns (Frame Count, Client Cost, Vendor Cost). Please check your data.');
            console.error('Invalid rows:', invalidRows);
            return; // Stop further processing if invalid data is found
        }        
    
        // Step 2: Check for duplicates in the new data and existing imported data
        let duplicates = checkForDuplicates(newData, importedData);
    
        // Step 3: If duplicates are found, prompt the user for confirmation
        if (duplicates.length > 0) {
            let message = `The following entries are duplicates:\n\n${duplicates.join('\n')}\n\nDo you want to proceed?`;
            if (!confirm(message)) {
                return; // Cancel the import if the user chooses not to proceed
            }
        }
    
        // Step 4: If the user proceeds, add each row from the new data to the shots container
        newData.forEach(row => {
            addShotFromExcel(row, mapping, headers, shotsContainer, batchId, universalService, universalVendor);
        });
    
        // Step 5: Merge the new data into importedData to keep track of all imported items
        importedData = importedData.concat(newData);

        // Update the visibility of the buttons based on the number of shots
        updateButtonVisibility(shotsContainer);
    }
    
    
    function addShotFromExcel(row, mapping, headers, shotsContainer, batchId, universalService, universalVendor) {
        let table = shotsContainer.querySelector('table');
        if (!table) {
            table = document.createElement('table');
            shotsContainer.appendChild(table);
            const headerRow = table.insertRow();
            headerRow.insertCell().textContent = ''; // For checkbox
            headerRow.insertCell().textContent = 'Shot Name';
            headerRow.insertCell().textContent = 'Frame Count';
            headerRow.insertCell().textContent = 'Services';
            headerRow.insertCell().textContent = 'Client Cost';
            headerRow.insertCell().textContent = 'Vendor Cost';
            headerRow.insertCell().textContent = 'Vendor';
            headerRow.insertCell().textContent = 'Actions';
        }
    
        // Ensure the table is visible
        table.style.display = '';
    
        const newRow = table.insertRow();
        const checkboxCell = newRow.insertCell();
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'edit-checkbox';
        checkboxCell.appendChild(checkbox);
    
        newRow.insertCell().innerHTML = `<input type="text" value="${row[mapping['Shot Name']] || ''}" placeholder="Shot Name" required>`;
        newRow.insertCell().innerHTML = `<input type="number" value="${row[mapping['Frame Count']] || ''}" placeholder="Frame Count" min="0" required>`;
    
        // Services dropdown
        const serviceCell = newRow.insertCell();
        const serviceSelect = document.createElement('select');
        serviceSelect.className = 'service-dropdown';
        const servicePlaceholderOption = document.createElement('option');
        servicePlaceholderOption.value = "";
        servicePlaceholderOption.textContent = "Select Service";
        serviceSelect.appendChild(servicePlaceholderOption);

        // Fetch services and populate the dropdown
        fetchServices().then(services => {
                services.forEach(service => {
                    const option = document.createElement('option');
                    option.value = service.id;
                    option.textContent = service.name;
                    serviceSelect.appendChild(option);
                });

                // Set the service value
                let serviceValue = row[mapping['Service']] || universalService || '';
                if (serviceValue) {
                    // Check if serviceValue is an ID or a name
                    let serviceOption = Array.from(serviceSelect.options).find(option => 
                        option.value === serviceValue || option.textContent === serviceValue
                    );
                    if (serviceOption) {
                        serviceSelect.value = serviceOption.value;
                        console.log(`Service "${serviceValue}" set successfully.`);
                    } else {
                        console.warn(`Service "${serviceValue}" not found in the dropdown options. Setting to default.`);
                        serviceSelect.value = ""; // Set to default "Select Service" option
                    }
                } else {
                    console.warn("No service value provided. Setting to default.");
                    serviceSelect.value = ""; // Set to default "Select Service" option
                }
                        
                console.log(`Set service for shot in batch ${batchId}:`, serviceSelect.value);
            }).catch(error => console.error('Error fetching services:', error));
        
            serviceCell.appendChild(serviceSelect);
    
        newRow.insertCell().innerHTML = `<input type="number" value="${row[mapping['Client Cost']] || ''}" placeholder="Client Cost" min="0" required>`;
        newRow.insertCell().innerHTML = `<input type="number" value="${row[mapping['Vendor Cost']] || ''}" placeholder="Vendor Cost" min="0" required>`;
    
        // Vendor dropdown
        const vendorCell = newRow.insertCell();
        const vendorSelect = document.createElement('select');
        vendorSelect.className = 'vendor-dropdown';
        vendorSelect.id = `batchVendor${batchId}`;
        vendorCell.appendChild(vendorSelect);
    
        fetchVendorsForBatch(batchId).then(vendors => {
            populateVendorDropdown(vendorSelect, vendors);
            vendorSelect.value = universalVendor || ''; // Set to the selected universal value
        }).catch(error => console.error('Error fetching vendors:', error));    
    
            newRow.insertCell().innerHTML = `<button type="button" class="deleteShotBtn">Delete</button>`;
        
            updateTotalCost(shotsContainer); // Update the total cost
        
    }
    

    function toggleBulkEditControls(batchId) {
        const bulkEditControls = document.querySelector(`#batch${batchId} .bulkEditControls`);
        const shotsContainer = document.querySelector(`#batch${batchId} .shotsContainer`);
        const columnSelect = document.getElementById(`columnToEdit${batchId}`);
        let newValueInput = document.getElementById(`newValue${batchId}`);

        if (shotsContainer && shotsContainer.querySelector('table') && shotsContainer.querySelector('table').rows.length > 1) { // Check if table exists and has rows
            bulkEditControls.style.display = bulkEditControls.style.display === 'none' ? 'block' : 'none';
            
            // Handle the change of column to edit
            columnSelect.addEventListener('change', () => {
                const columnToEdit = columnSelect.value; // Define columnToEdit here
                if (columnToEdit === 'Vendor Name') {
                    // Replace the input with a dropdown
                    const vendorSelect = document.createElement('select');
                    vendorSelect.id = `vendorSelectBulkEdit${batchId}`;

                    // Populate the dropdown with vendor options
                    fetchVendorsForBatch(batchId)
                        .then(vendors => {
                            populateVendorDropdown(vendorSelect, vendors);
                            console.log(`Vendor dropdown populated for batch ${batchId}:`, vendorSelect.innerHTML);
                        })
                        .catch(error => {
                            console.error('Error fetching vendors:', error);
                            populateVendorDropdown(vendorSelect, []); // Pass an empty array to handle errors
                        });

                    newValueInput.replaceWith(vendorSelect);
                    newValueInput = vendorSelect;
                } else if (columnToEdit === 'Services') {
                    // Create a new services dropdown for bulk editing
                    const servicesSelect = document.createElement('select');
                    servicesSelect.id = `servicesSelectBulkEdit${batchId}`;
    
                    // Populate the dropdown with service options
                    fetchServices()
                        .then(services => {
                            populateServicesDropdown(servicesSelect, services);
                            console.log(`Services dropdown populated for batch ${batchId}:`, servicesSelect.innerHTML);
                        })
                        .catch(error => {
                            console.error('Error fetching services:', error);
                            populateServicesDropdown(servicesSelect, []); // Pass an empty array to handle errors
                        });
    
                    newValueInput.replaceWith(servicesSelect);
                    newValueInput = servicesSelect;
                } else {
                    // Replace the dropdown with a text input
                    if (newValueInput.tagName.toLowerCase() !== 'input') {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.id = `newValue${batchId}`;
                        input.placeholder = 'New Value';
                        newValueInput.replaceWith(input);
                        newValueInput = input;
                    }
                }
            });

            // Add event listener for applying changes
            const applyChangesBtn = bulkEditControls.querySelector('button');
            applyChangesBtn.addEventListener('click', () => {
                console.log(`Applying bulk edit for batch ${batchId}`);
                applyBulkEdit(batchId);
            });

        } else {
            alert("No rows to edit. Add shots first.");
            bulkEditControls.style.display = 'none';
        }
    }

    function applyBulkEdit(batchId) {
        const columnToEdit = document.getElementById(`columnToEdit${batchId}`).value;        
        const batchContainer = document.getElementById(`batch${batchId}`);
        const checkboxes = batchContainer.querySelectorAll('.edit-checkbox:checked');
    
        if (checkboxes.length === 0) {
            alert("Select at least one row to edit.");
            return;
        }

        let newValueElement = document.getElementById(`newValue${batchId}`);
        if (columnToEdit === 'Vendor Name') {
            newValueElement = document.getElementById(`vendorSelectBulkEdit${batchId}`);
        } else if (columnToEdit === 'Services') {
            newValueElement = document.getElementById(`servicesSelectBulkEdit${batchId}`);        
        }

        console.log("New value element found:", newValueElement);
        
        // Ensure newValueElement is not null or undefined
        if (!newValueElement || newValueElement.value === '') {
            alert(`Please select a valid value for ${columnToEdit}.`);
            console.error(`Invalid value selected for ${columnToEdit}: ${newValueElement ? newValueElement.value : 'null or undefined'}`);
            return;
        }

        // Validate numerical inputs
        if (['Frame Count', 'Client Cost', 'Vendor Cost'].includes(columnToEdit)) {
            if (!/^\d+(\.\d{1,2})?$/.test(newValueElement.value)) {
                alert(`Please enter a valid number for ${columnToEdit}.`);
                return;
            }
        }
    
        checkboxes.forEach(checkbox => {
            const row = checkbox.closest('tr');
            let input;
            switch(columnToEdit) {
                case 'Shot Name':
                    input = row.cells[1].querySelector('input'); // Assuming 'Shot Name' is the second cell
                    if (input) {
                        input.value = newValueElement.value;
                        console.log(`Updated Shot Name to: ${input.value}`);
                    }
                    break;
                case 'Frame Count':
                    input = row.cells[2].querySelector('input');
                    if (input) {
                        input.value = parseInt(newValueElement.value, 10);
                        console.log(`Updated Frame Count to: ${input.value}`);
                    }
                    break;
                case 'Services':
                    input = row.cells[3].querySelector('.service-dropdown');
                    if (input && newValueElement.value !== '') {
                        input.value = newValueElement.value;
                        // Trigger change event to ensure any listeners are notified
                        const event = new Event('change', { bubbles: true });
                        input.dispatchEvent(event);
                        console.log(`Updated Service ID to: ${input.value}`);
                        
                        // Store the service ID as a data attribute for easier retrieval
                        row.dataset.serviceId = input.value;
                    } else {
                        console.error(`Failed to set Service ID for shot in batch ${batchId}. Value is: ${newValueElement.value}`);
                    }
                    break;
                case 'Client Cost':
                    input = row.cells[4].querySelector('input'); // Assuming 'Client Cost' is the fifth cell
                    if (input) {
                        input.value = parseFloat(newValueElement.value).toFixed(2);
                        console.log(`Updated Client Cost to: ${input.value}`);
                    }
                    break;
                case 'Vendor Cost':
                    input = row.cells[5].querySelector('input'); // Assuming 'Vendor Cost' is the sixth cell
                    if (input) {
                        input.value = parseFloat(newValueElement.value).toFixed(2);
                        console.log(`Updated Vendor Cost to: ${input.value}`);
                    }
                    break;
                case 'Vendor Name':
                    input = row.cells[6].querySelector('.vendor-dropdown');
                    if (input) {
                        input.value = newValueElement.value;
                        console.log(`Updated Vendor ID to: ${input.value}`);
                    }
                    break;
                default:
                    console.error(`Unknown column to edit: ${columnToEdit}`);
            }
        });

        console.log(`Bulk edit applied to ${checkboxes.length} rows for ${columnToEdit}`);
    }    
         
    function updateTotalCost(container) {
        const vendorCosts = container.querySelectorAll('input[placeholder="Vendor Cost"]');
        const clientSelect = document.getElementById('clientName');
        const selectedOption = clientSelect.options[clientSelect.selectedIndex] || {};
        const clientType = selectedOption.dataset ? selectedOption.dataset.type : 'domestic'; // default to 'domestic' if undefined
    
        let totalCost = Array.from(vendorCosts).reduce((acc, input) => {
            let cost = parseFloat(input.value || 0);
            // Adjust cost based on client type if needed
            if (clientType === 'international') {
                cost *= 1.1;  // Example: Add 10% surcharge for international clients
            }
            return acc + cost;
        }, 0);
    
        document.getElementById('totalCost').textContent = totalCost.toFixed(2);
    }
    
    function saveProject(e) {
        e.preventDefault();

        const projectId = document.getElementById('projectId').value;
        const projectName = document.getElementById('projectName').value;
        const projectDate = document.getElementById('projectDate').value;
        const projectStage = document.getElementById('projectStage').value;
        const clientName = document.getElementById('clientName').value;
        const notes = document.getElementById('notes').value;

        if (!projectName || !projectDate || !projectStage || !clientName) {
            alert("Please fill in all required fields.");
            return;
        }    

        let allFieldsValid = true;
        const batches = [];
        const batchElements = document.querySelectorAll('.batch');        

        batchElements.forEach((batchElement, batchIndex) => {
            const batchDateInput = batchElement.querySelector('input[type="date"]');
            const batchDate = batchDateInput ? batchDateInput.value : batchElement.querySelector('span').textContent.trim(); // Fix here
            
            console.log(`Batch Index: ${batchIndex}, Batch Date: ${batchDate}`);

            if (!batchDate) {
                alert("Please fill in the batch date.");            
                allFieldsValid = false;
                batchDateInput?.focus();
                return;
            }

            const shots = [];
            const shotElements = batchElement.querySelectorAll('.shotsContainer tr');
            if (shotElements.length > 1) { // Check if there are any shots (excluding the header row)
            shotElements.forEach((shotElement, shotIndex) => {
                if (shotIndex === 0) return; // Skip header row

                const shotNameInput = shotElement.querySelector('input[placeholder="Shot Name"]');
                const frameCountInput = shotElement.querySelector('input[placeholder="Frame Count"]');
                const clientCostInput = shotElement.querySelector('input[placeholder="Client Cost"]');
                const vendorCostInput = shotElement.querySelector('input[placeholder="Vendor Cost"]');
                const shotVendorDropdown = shotElement.querySelector('.vendor-dropdown');
                const serviceDropdown = shotElement.querySelector('.service-dropdown');

                const shotName = shotNameInput ? shotNameInput.value : null;
                const frameCount = frameCountInput ? frameCountInput.value : null;
                const clientCost = clientCostInput ? clientCostInput.value : null;
                const vendorCost = vendorCostInput ? vendorCostInput.value : null;
                const shotVendorId = shotVendorDropdown ? shotVendorDropdown.value : null;
                const serviceId = serviceDropdown ? serviceDropdown.value : shotElement.dataset.serviceId; // Use data attribute as fallback
                
                console.log(`Shot Data - Batch Index: ${batchIndex}, Shot Index: ${shotIndex}, Name: ${shotName}, Frame Count: ${frameCount}, Client Cost: ${clientCost}, Vendor Cost: ${vendorCost}, Shot Vendor ID: ${shotVendorId}, Service ID: ${serviceId}`);

                if (!shotName || !frameCount || !clientCost || !vendorCost || !shotVendorId || !serviceId) {
                    console.error(`Missing required field(s) for shot ${shotIndex} in batch ${batchIndex + 1}.`);
                    alert("Please fill in all required fields for each shot.");
                    allFieldsValid = false;
                    if (!shotName) {
                        shotNameInput?.focus();
                      } else if (!frameCount) {
                        frameCountInput?.focus();
                      } else if (!clientCost) {
                        clientCostInput?.focus();
                      } else if (!vendorCost) {
                        vendorCostInput?.focus();
                      } else if (!shotVendorId) {
                        shotVendorDropdown?.focus();
                      } else if (!serviceId) {
                        serviceDropdown?.focus();
                      }
                      return;
                    }            

                shots.push({
                    shotName: shotName,
                    frameCount: frameCount,
                    clientCost: clientCost,
                    vendorCost: vendorCost,
                    vendorId: shotVendorId,
                    serviceId: serviceId
                });            
            });

        } else {
            console.error(`No shots found for batch ${batchIndex + 1}.`);
            alert("Please add at least one shot for each batch.");
            allFieldsValid = false;
            return;
        }

        // Retrieve the finalized status from the dataset
        const isFinalized = batchElement.querySelector('.batchContent').dataset.isFinalized === 'true';

        batches.push({
            batchDate: batchDate,
            is_finalized: isFinalized,  // Set the is_finalized flag correctly
            shots: shots,
            // vendorId: batchElement.querySelector('.vendor-dropdown').value,
        });        
    });

    if (allFieldsValid) {
        const projectData = {
            id: projectId,
            name: projectName,
            date_created: projectDate,
            stage: projectStage,
            client_id: clientName,
            notes: notes,
            batches: batches
        };

        console.log("Saving project with data:", JSON.stringify(projectData, null, 2));

        fetch(`/api/projects${projectId ? `/${projectId}` : ''}`, {
            method: projectId ? 'PUT' : 'POST', // Use 'POST' for new projects, 'PUT' for updates
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(projectData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error saving project:', data.error);
            } else {
                console.log('Project saved successfully:', data);
                fetchProjects(); // Refresh the project list
                resetFormAndUI();
            }
        })
        .catch(error => console.error('Error:', error));
    }
}

    function resetBatches() {
        const batchesContainer = document.getElementById('batchesContainer');
        batchesContainer.innerHTML = ''; // Clear existing batch elements
        batchCounter = 0; // Reset the batch counter to avoid inconsistencies
    }

    async function editProjectDetails(projectId) {
        resetBatches(); // Clear existing batch UI
        batchCounter = 0; // Ensure batchCounter is reset before starting

        try {
            const response = await fetch(`/api/projects/${projectId}`);
            const project = await response.json();

                if (project.error) {
                    console.error('Error fetching project details:', project.error);
                    return;
                }

                console.log("Project details fetched:", project);
    
                const projectIdInput = document.getElementById('projectId');
                const projectNameInput = document.getElementById('projectName');
                const projectDateInput = document.getElementById('projectDate');
                const projectStageInput = document.getElementById('projectStage');
                const clientNameInput = document.getElementById('clientName');
                const notesInput = document.getElementById('notes');

                if (projectIdInput) projectIdInput.value = project.id;
                if (projectNameInput) projectNameInput.value = project.name;

                // Convert the date to the required format "yyyy-MM-dd"
                const projectDate = new Date(project.date_created);
                const formattedDate = projectDate.toISOString().split('T')[0];
                if (projectDateInput) projectDateInput.value = formattedDate;

                if (projectStageInput) projectStageInput.value = project.stage;
                if (clientNameInput) clientNameInput.value = project.client_id;
                if (notesInput) notesInput.value = project.notes;             

                // Populate batches and shots
                for (let batchIndex = 0; batchIndex < project.batches.length; batchIndex++) {
                    const batch = project.batches[batchIndex];
                    addBatch(); // Add a new batch, this increments batchCounter
                    const currentBatchIndex = batchCounter; // Store the current batch index for reference

                    const batchElement = document.getElementById(`batch${currentBatchIndex}`);
                    if (batchElement) {
                        const batchContent = batchElement.querySelector('.batchContent');
                        const dateInput = batchElement.querySelector('input[type="date"]');                        
    
                        if (dateInput) { 
                            // Convert ISO date to "YYYY-MM-DD"
                            const batchDate = new Date(batch.batch_date).toISOString().split('T')[0];
                            console.log(`Setting batch date for batch ${currentBatchIndex}:`, batchDate);
                            dateInput.value = batchDate || ""; // Set the batch date
                        } else {
                            console.error(`Date input not found for batch number ${currentBatchIndex}`);
                        }
    
                        const shotsContainer = batchElement.querySelector('.shotsContainer');
                        if (shotsContainer) {
                            for (let shotIndex = 0; shotIndex < batch.shots.length; shotIndex++) {
                                const shot = batch.shots[shotIndex];
                                addShot(shotsContainer, currentBatchIndex); // Use currentBatchIndex for batch reference
                                const lastRow = shotsContainer.querySelector('tr:last-child');

                                if (lastRow) {
                                    const shotNameInput = lastRow.querySelector('input[placeholder="Shot Name"]');
                                    const frameCountInput = lastRow.querySelector('input[placeholder="Frame Count"]');
                                    const clientCostInput = lastRow.querySelector('input[placeholder="Client Cost"]');
                                    const vendorCostInput = lastRow.querySelector('input[placeholder="Vendor Cost"]');
                                    const shotVendorDropdown = lastRow.querySelector('.vendor-dropdown');
                                    const serviceDropdown = lastRow.querySelector('.service-dropdown');
    
                                    if (shotNameInput) shotNameInput.value = shot.shot_name;
                                    if (frameCountInput) frameCountInput.value = shot.frame_count;
                                    if (clientCostInput) clientCostInput.value = shot.client_cost;
                                    if (vendorCostInput) vendorCostInput.value = shot.vendor_cost;
    
                                    // Fetch services and populate the service dropdown
                                    const services = await fetchServices();
                                    if (serviceDropdown) {
                                        serviceDropdown.innerHTML = ""; // Clear the dropdown before populating
                                        const placeholderOption = document.createElement('option');
                                        placeholderOption.value = "";
                                        placeholderOption.textContent = "Select Service";
                                        serviceDropdown.appendChild(placeholderOption);

                                        services.forEach(service => {
                                            const option = document.createElement('option');
                                            option.value = service.id;
                                            option.textContent = service.name;
                                            serviceDropdown.appendChild(option);
                                        });

                                        if (shot.service_id) {
                                            serviceDropdown.value = shot.service_id;
                                            console.log(`Set service for shot ${shotIndex} in batch ${currentBatchIndex}:`, shot.service_id);
                                        } else {
                                            console.log(`No service ID for shot ${shotIndex} in batch ${currentBatchIndex}`);
                                        }

                                        serviceDropdown.addEventListener('change', function() {
                                            console.log(`Service changed for shot ${shotIndex} in batch ${currentBatchIndex}:`, this.value);
                                        });
                                    } else {
                                        console.error(`Service dropdown not found for shot in batch number ${currentBatchIndex}`);
                                    }
    
                                    // Set the vendor dropdown value
                                    if (shotVendorDropdown) {
                                        const vendors = await fetchVendorsForBatch(currentBatchIndex);
                                        populateVendorDropdown(shotVendorDropdown, vendors);
                                        shotVendorDropdown.value = shot.vendor_id || "";
                                        
                                        if (!shotVendorDropdown.value) {
                                            console.error(`Failed to set vendor for shot ${shotIndex} in batch ${currentBatchIndex}. Vendor ID: ${shot.vendor_id}`);
                                        }
                                    } else {
                                        console.error(`Vendor dropdown not found for shot in batch number ${currentBatchIndex}`);
                                    }
                                } else {
                                    console.error(`Last row not found for batch number ${currentBatchIndex}`);
                                }
                            }
                        } else {
                            console.error(`Shots container not found for batch number ${currentBatchIndex}`);
                        }
                        // Check if the batch is finalized and freeze it if true, skip confirmation
                        if (batch.is_finalized) {
                            finalizeBatch(batchContent, true); // Pass true to skip confirmation
                        }
                    } else {
                        console.error(`Batch element with ID batch${currentBatchIndex} not found`);
                    }
                }
    
                // Show the form and update the tab
                const projectFormContainer = document.getElementById('projectFormContainer');
                if (projectFormContainer) {
                    projectFormContainer.style.display = 'block';
                }
                const firstTabLink = document.querySelector('.tablinks');
                if (firstTabLink) {
                    firstTabLink.click();
                }
            } catch (error) {
                console.error('Error fetching project details:', error);
        }
    }

});
