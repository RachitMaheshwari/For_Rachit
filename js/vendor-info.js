// Tab switching function
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

document.addEventListener('DOMContentLoaded', function() {
    const socket = io('http://localhost:3000');
    console.log('Document is ready.');
    // Initial setup for vendor-info.html
    let selectedServices = new Set();
    let allVendors = []; // Ensure allVendors is defined here
    setupEventListeners();
    fetchServices(); // Fetch services on page load
    fetchVendors(); // Call fetchVendors when the DOM is fully loaded

    // Set default open tab
    document.querySelector('.tablinks').click();

    function setupEventListeners() {
        const addVendorForm = document.getElementById('addVendorForm');
        const newVendorButton = document.getElementById('newVendorButton');
        const vendorFormContainer = document.getElementById('vendorFormContainer');
        const deleteSelectedButton = document.getElementById('deleteSelectedButton'); // Ensure this is defined before using

        newVendorButton.addEventListener('click', function() {
            resetFormAndUI();
            addVendorForm.reset();
            document.getElementById('vendorId').value = ''; // Clear vendor ID to indicate a new entry
            document.getElementById('vendorName').disabled = false; // Enable the vendor name field
            vendorFormContainer.style.display = 'block'; // Ensure the form is visible
        });

        addVendorForm?.addEventListener('submit', function(e) {
            e.preventDefault();
            const vendorId = document.getElementById('vendorId').value; // Get the value from the hidden field
            const updatedVendorData = {
                id: vendorId, // This will be empty for new vendors and filled for updates
                name: document.getElementById('vendorName').value,
                address: document.getElementById('address').value,
                dateCreated: document.getElementById('dateCreated').value,
                paymentAtCompanyLevel: document.getElementById('paymentAtCompanyLevel').checked,
                paymentDetails: document.getElementById('paymentDetails').value,
                gst: document.getElementById('gst').value,
                primaryPhone: document.getElementById('primaryPhone').value,
                // Add other fields if necessary
            };
            addVendor(updatedVendorData);
        });

        document.querySelectorAll('.tablinks').forEach(button => {
            button.addEventListener('click', function(event) {
                const tabName = button.getAttribute('onclick').match(/'([^']+)'/)[1];
                openTab(event, tabName);
            });
        });

        const addRateButton = document.getElementById('addRateButton'); // Using optional chaining here
        addRateButton?.addEventListener('click', function() {
            addServiceRateField(true); // Call with parameter to fetch services after adding the field
        });

        
        const addTeammateButton = document.getElementById('addTeammateButton'); // Using optional chaining here
        addTeammateButton?.addEventListener('click', () => addTeammateField(null)); // Pass null or the specific data structure expected
    }

        // Add event listener for deleteSelectedButton
        document.getElementById('deleteSelectedButton').addEventListener('click', deleteSelectedVendors);    

      // Add new listeners for dynamic visibility control of inputs
      document.getElementById('serviceRatesContainer').addEventListener('change', function(e) {
        if (e.target.name === 'projectBasis' && e.target.type === 'checkbox') {
            const rateInput = e.target.closest('.service-rate').querySelector('input[type="text"]');
            rateInput.style.display = e.target.checked ? 'none' : 'inline';
        }
    });  

    document.getElementById('serviceRatesContainer').addEventListener('click', function(e) {
        if (e.target.classList.contains('info-btn')) {
            alert('Project Basis Costing means the cost of the service is calculated based on the entire project scope rather than a fixed hourly rate.');
        }
    });

    // Update selected services when a service is chosen
    document.getElementById('serviceRatesContainer').addEventListener('change', function(e) {
        if (e.target.name === 'serviceName') {
            const previousValue = e.target.dataset.previousValue;
            if (previousValue) {
                selectedServices.delete(previousValue);
            }
            selectedServices.add(e.target.value);
            e.target.dataset.previousValue = e.target.value;
            updateServiceDropdowns();
        }
    });


    // Changed: Listener for toggle visibility of notes input independently 
    document.getElementById('teammateDetailsContainer').addEventListener('click', function(e) {
        if (e.target.className === 'toggle-notes') {
            const notesInput = e.target.closest('.teammate-details').querySelector('input[name="notes"]');
            notesInput.style.display = notesInput.style.display === 'none' ? 'inline' : 'none';
        }
    });

    const paymentAtCompanyLevelCheckbox = document.getElementById('paymentAtCompanyLevel');
    paymentAtCompanyLevelCheckbox.addEventListener('change', function() {
        togglePaymentDetails(this.checked);
    });

    // Initial visibility setup based on the checkbox state
    togglePaymentDetails(paymentAtCompanyLevelCheckbox.checked);


    

    function togglePaymentDetails(hide) {
        const gstInput = document.getElementById('gst');
        const paymentDetailsInput = document.getElementById('paymentDetails');
        gstInput.style.display = hide ? 'inline-block' : 'none';
        paymentDetailsInput.style.display = hide ? 'inline-block' : 'none';

        document.querySelectorAll('.teammate-details input[name="paymentDetails"]').forEach(input => {
            input.style.display = hide ? 'none' : 'inline-block';
        });
    }

    function deleteSelectedVendors() {
        const selectedVendorIds = Array.from(document.querySelectorAll('#vendorList input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.getAttribute('data-id'));
    
        if (selectedVendorIds.length === 0) {
            alert('No vendors selected for deletion');
            return;
        }
    
        if (confirm('Are you sure you want to delete the selected vendors?')) {
            fetch('/api/vendors/bulk-delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ids: selectedVendorIds })
            })
            .then(response => {
                if (response.ok) {
                    alert('Selected vendors deleted successfully');
                    fetchVendors(); // Refresh the vendors list
                } else {
                    alert('Failed to delete selected vendors');
                }
            })
            .catch(error => console.error('Error deleting selected vendors:', error));
        }
    }

    /* function populatePaymentModes() {
        const paymentSelect = document.getElementById('paymentModes');
        paymentSelect.innerHTML = ''; // Clear existing options
        const paymentOptions = [  
            { name: 'Select Payment Mode', value: '' },                  
            { name: 'Bank/Wire Transfers', value: 'bank-transfer' },
            { name: 'PayPal or Any Alternative', value: 'paypal' },
            { name: 'Cheque Payment', value: 'cheque' }            
        ];
        paymentOptions.forEach(option => {
            const newOption = new Option(option.name, option.value);
            paymentSelect.appendChild(newOption);
        });
    } */

    function addVendor() {
        let method, url;
        const updatedVendorData = { /////Pending - I think this is done right//
            name: document.getElementById('vendorName').value,
            address: document.getElementById('address').value,
            dateCreated: document.getElementById('dateCreated').value,
            paymentAtCompanyLevel: document.getElementById('paymentAtCompanyLevel').checked,
            paymentDetails: document.getElementById('paymentDetails').value,
            gst: document.getElementById('gst').value,
            primaryPhone: document.getElementById('primaryPhone').value,
            services: [],
            teammates: [],
            serviceRates: []
        };
    
        const companyId = document.getElementById('vendorId').value;
        if (companyId) {
            // This is an update
            method = 'PUT';
            url = `/api/vendors/${vendorId}`;
        } else {
            // This is a new company
            method = 'POST';
            url = '/api/vendors';
        }
    
        // Collect service and rate data
        const serviceRateFields = document.querySelectorAll('.service-rate');
        const serviceRates = [];
    
        serviceRateFields.forEach(container => {
            const serviceId = container.querySelector('select').value;
            if (serviceId) {
                selectedServices.add(serviceId); // Add the selected service to the set
            }
            const rate = container.querySelector('input[type="text"]').value;
            const isProjectBasis = container.querySelector('input[type="checkbox"]').checked;
    
            // Check if the rate is not an empty string or if it's a project basis rate
            if (rate || isProjectBasis) {
                const serviceRate = { serviceId, projectBasis: isProjectBasis };
                if (!isProjectBasis) {
                    serviceRate.rate = rate;
                }
                serviceRates.push(serviceRate);
            }
        });
    
        // Assign the serviceRates array to the updatedVendorData
        updatedVendorData.serviceRates = serviceRates;
    
        // Collect employee data - Pending till fetch URL
        document.querySelectorAll('.teammate-details').forEach(div => {
            updatedVendorData.teammates.push({
                names: div.querySelector('[name="teammateNames"]').value,
                panCardNo: div.querySelector('[name="panCardNo"]').value,
                paymentDetails: div.querySelector('[name="paymentDetails"]').value,
                email: div.querySelector('[name="email"]').value,
                phone: div.querySelector('[name="phone"]').value,
                notes: div.querySelector('[name="notes"]').value
            });
        });
    
        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedVendorData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Vendor updated:', data);
            fetchVendors(); // Refresh the Vendors list
            resetFormAndUI(); // Reset the form and any UI components
        })
        .catch(error => console.error('Error updating Vendor:', error));
    }

///// Completed till here except for few sections above

    function resetFormAndUI() {
        console.log('Resetting form and UI elements...');
        document.getElementById('addVendorForm').reset(); // Resets the form fields
        
        //fetchCountries(); // Repopulate country dropdown
        fetchServices(); // Refetch and repopulate services dropdown
        //fetchCompanies(); // Refetch companies list
        //populatePaymentModes(); // Repopulate payment modes dropdown
    
        const serviceRatesContainer = document.getElementById('serviceRatesContainer');
        const teammateDetailsContainer = document.getElementById('teammateDetailsContainer');
        
        // Clear the service rates and employee details containers
        serviceRatesContainer.innerHTML = '';
        teammateDetailsContainer.innerHTML = '';
    
        // Reinitialize the containers with necessary buttons and fields
        addInitialServiceRateButton(); // Function to add "Add Rates for Services" button
        addInitialTeammateButton(); // Function to add "Add Teammate" button
        
        selectedServices.clear(); // Clear selected services set

        // Check if vendorId field is empty, then clear all form fields
        const vendorIdField = document.getElementById('vendorId');
        if (vendorIdField.value === '') {
            document.getElementById('vendorName').value = '';
            document.getElementById('address').value = '';
            document.getElementById('dateCreated').value = '';
            document.getElementById('paymentAtCompanyLevel').checked = false;
            document.getElementById('paymentDetails').value = '';
            document.getElementById('gst').value = '';
            document.getElementById('primaryPhone').value = '';
        }
    }
    
    function addInitialServiceRateButton() {
        console.log('Adding initial service rate button...');
        const container = document.getElementById('serviceRatesContainer');
        const button = document.createElement('button');
        button.textContent = 'Add Rates for Services';
        button.id = 'addRateButton';
        button.type = 'button';
        button.addEventListener('click', function() {
            addServiceRateField(true);
        });
        container.appendChild(button);
    }
    
    function addInitialTeammateButton() {
        console.log('Adding initial teammate button...');
        const container = document.getElementById('teammateDetailsContainer');
        const button = document.createElement('button');
        button.textContent = 'Add Teammate';
        button.id = 'addTeammateButton';
        button.type = 'button';
        button.addEventListener('click', addTeammateField);
        container.appendChild(button);
    }

    function fetchServices() {
        fetch('/api/services').then(response => response.json()).then(data => {
            window.cachedServices = data;
            updateServiceDropdowns();  // Marked change: Update dropdowns with fetched data
        }).catch(error => console.error('Error fetching services:', error));
    }
        
    function fetchVendors() {
        //console.log("Fetching companies...");
        fetch('/api/vendors')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                allVendors = data; // Store all vendors data globally                
                const vendorList = document.getElementById('vendorList');
                if (vendorList) {
                    vendorList.innerHTML = ''; // Clear existing list items if any
    
                    allVendors.forEach(vendor => {
                        const listItem = document.createElement('li');
                        listItem.id = 'vendor-' + vendor.id;

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.classList.add('vendor-checkbox');
                        checkbox.setAttribute('data-id', vendor.id);

                        const vendorSpan = document.createElement('span');
                        vendorSpan.textContent = vendor.name;
                        vendorSpan.onclick = function() { editVendorDetails(vendor.id); };
                            
                        // Create a delete button or icon
                        const deleteButton = document.createElement('button');
                        deleteButton.textContent = 'Delete';
                        deleteButton.classList.add('delete-vendor');
                        deleteButton.onclick = function() { deleteVendor(vendor.id); };

                        listItem.appendChild(checkbox);
                        listItem.appendChild(vendorSpan);
                        listItem.appendChild(deleteButton); 

                        vendorList.appendChild(listItem);

                        // Event listener for checkbox change
                        checkbox.addEventListener('change', handleCheckboxChange);
                    });

                    // Show delete selected button if there are vendors
                    document.getElementById('deleteSelectedButton').style.display = allVendors.length > 0 ? 'block' : 'none';
                } else {
                    //console.log('companyList element not found');
                }

                // Reset the form and UI elements
                resetFormAndUI();
            })
            .catch(error => {
                console.error('Error fetching vendors:', error);
            });
    }

    function handleCheckboxChange() {
        const checkboxes = document.querySelectorAll('.vendor-checkbox');
        const deleteButton = document.getElementById('deleteSelectedButton');
        let anyChecked = false;
    
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                anyChecked = true;
            }
        });
    
        deleteButton.style.display = anyChecked ? 'inline-block' : 'none';
    }

    function deleteVendor(vendorId) {
        if (confirm(`Are you sure you want to delete the vendor with ID ${vendorId}?`)) {
            fetch(`/api/vendors/${vendorId}`, {
                method: 'DELETE'
            })
            .then(response => {
                if (response.ok) {
                    alert('Vendor deleted successfully');
                    fetchVendors(); // Refresh the vendors list
                } else {
                    alert('Failed to delete the vendor');
                }
            })
            .catch(error => console.error('Error deleting vendor:', error));
        }
    }

    function editVendorDetails(vendorId) {
        console.log("Editing details for vendor ID:", vendorId);        
        const vendorData = allVendors.find(vendor => vendor.id.toString() === vendorId.toString());

        // Set the vendorId in the form field
        const vendorIdField = document.getElementById('vendorId');
        if (vendorIdField) {
            vendorIdField.value = vendorId;
            vendorIdField.disabled = true; // Disable the vendorID input
        } else {
            console.error('vendorId input field not found');
            return; // Exit the function if the field isn't found
        }        

        if (vendorData) {
            console.log("Vendor Data:", vendorData);
            document.getElementById('vendorId').value = vendorId; // Set the vendorId in the hidden field

            const vendorNameField = document.getElementById('vendorName');
            vendorNameField.value = vendorData.name || '';
            vendorNameField.disabled = true; // Disable the companyName input

            document.getElementById('address').value = vendorData.address || '';
    
            // Corrected to match the date properties in your data
            document.getElementById('dateCreated').value = vendorData.date_created ? vendorData.date_created.substring(0, 10) : '';
            document.getElementById('paymentAtCompanyLevel').checked = vendorData.payment_at_company_level;
            document.getElementById('paymentDetails').value = vendorData.payment_details || '';
            document.getElementById('gst').value = vendorData.gst || '';
            document.getElementById('primaryPhone').value = vendorData.primary_phone || '';     


            // Clear existing entries for dynamic content
            document.getElementById('serviceRatesContainer').innerHTML = '';
            document.getElementById('teammateDetailsContainer').innerHTML = '';

            // Add initial buttons for service rates and employees
            addInitialServiceRateButton();
            addInitialTeammateButton();
            

            // Initialize updated arrays for service rates and employees
            const updatedServiceRates = [];
            const updatedTeammates = [];

            // Dynamically add services and employees
            if (Array.isArray(vendorData.service_rates) && vendorData.service_rates.length > 0) {
                console.log("Service Rates:", vendorData.service_rates);
                vendorData.service_rates.forEach(serviceRate => {
                    if (serviceRate && serviceRate.service_name != null) {
                        selectedServices.add(serviceRate.service_name.toString()); // Add to selectedServices set
                        const updatedServiceRate = {
                            serviceId: serviceRate.service_name, // The ID of the service
                            rate: serviceRate.rate, // The rate for the service
                            projectBasis: serviceRate.project_basis // Whether the rate is based on the project
                    };
                    updatedServiceRates.push(updatedServiceRate);
                    addServiceRateField(updatedServiceRate);
                    }
                });
            } else {
                console.log("No service rates found for this vendor.");
            }
            
    
            // Dynamically add teammates
            if (Array.isArray(vendorData.teammates) && vendorData.teammates.length > 0) {
                console.log("Teammates:", vendorData.teammates);
                vendorData.teammates.forEach(teammate => {
                    const updatedTeammate = {
                        names: teammate.names,
                        panCardNo: teammate.pan_card_no,
                        paymentDetails: teammate.payment_details,
                        email: teammate.email,
                        phone: teammate.phone,
                        notes: teammate.notes
                    };
                    updatedTeammates.push(updatedTeammate);
                    addTeammateField(updatedTeammate);
                });
            } else {
                console.log("No teammates found for this vendor.");
            }
            

            // Update the updatedVendorData object with the updated service rates and employees
            const updatedVendorData = {
                name: vendorData.name,
                address: vendorData.address,
                dateCreated: vendorData.date_created,
                paymentAtCompanyLevel: vendorData.payment_at_company_level,
                paymentDetails: vendorData.payment_details,
                gst: vendorData.gst,
                primaryPhone: vendorData.primary_phone,
                serviceRates: updatedServiceRates,
                teammates: updatedTeammates
            };

            // Pass the updatedVendorData object to the addVendor function            
        } else {
            console.error('Vendor data not found for ID:', vendorId);
        }
    }

    function addServiceRateField(serviceRate = null) {
        console.log("Adding service rate field with data:", serviceRate); // Debug: log data being used
        const container = document.getElementById('serviceRatesContainer');
        const div = document.createElement('div');
        div.className = 'service-rate';
        
        const serviceSelect = document.createElement('select');
        serviceSelect.name = 'serviceName';
        
        // Preserve the current selection state
        const currentSelections = Array.from(container.querySelectorAll('.service-rate select[name="serviceName"]')).map(select => select.value);
    
        // Add the 'Select Service' placeholder as the first option
        const placeholderOption = new Option('Select Service', '');
        placeholderOption.disabled = true;
        placeholderOption.selected = true;  //Ensure it is the default selected - Come back to this later
        serviceSelect.appendChild(placeholderOption);
        
        // Populate new dropdown without resetting existing selections
        if (window.cachedServices) {
            window.cachedServices.forEach(service => {
                const option = new Option(service.name, service.id.toString()); // Convert to string here
                option.disabled = selectedServices.has(service.id);
                serviceSelect.appendChild(option);
                if (serviceRate && serviceRate.serviceId) {
                    option.selected = serviceRate.serviceId.toString() === service.id.toString();

                //if (serviceRate && serviceRate.serviceId === service.id.toString()) {
                //    option.selected = true; // Set the saved service as selected
                // option.selected = serviceRate && (serviceRate.serviceId?.toString() || '') === service.id.toString();
                }
            });
        }
        
        div.innerHTML = `
            <label>
                <span>Project Basis Costing?</span> <!-- This is the new span element -->
                <input type="checkbox" name="projectBasis">                
                <button class="info-btn">?</button>
            </label>    
            <input type="text" name="rate" placeholder="Enter Rate (e.g., $100)">
            <button class="delete-rate">Delete Rate</button>
        `;
        
        div.insertAdjacentElement('afterbegin', serviceSelect);
        container.appendChild(div);
        
        div.querySelector('.delete-rate').addEventListener('click', function() {
            const serviceId = serviceSelect.value;
            if (serviceId) {
                selectedServices.delete(serviceId); // Remove the service from the selectedServices set
            }
            div.remove();
            updateServiceDropdowns();  // Update selections after removing a rate
        });
        
        // Apply previously selected values to all dropdowns
        container.querySelectorAll('.service-rate select[name="serviceName"]').forEach((select, index) => {
            if (index < currentSelections.length) {
                select.value = currentSelections[index];
            }
        });

        updateServiceDropdowns();  // Marked change: Ensure options are updated immediately when added
    
        if (!window.cachedServices) {
            fetchServices();
        }
    
        // If serviceRate is provided, populate the fields with the provided data
        if (serviceRate && serviceRate.serviceId != null) {
            const serviceOption = serviceSelect.querySelector(`option[value="${serviceRate.serviceId.toString()}"]`); // Convert to string here if needed
            if (serviceOption) {
                serviceOption.selected = true;        
                updateServiceDropdowns();
            }
    
            const rateInput = div.querySelector('input[type="text"]');
            rateInput.value = serviceRate.rate || '';
    
            const projectBasisCheckbox = div.querySelector('input[type="checkbox"]');
            projectBasisCheckbox.checked = serviceRate.projectBasis;
            rateInput.style.display = serviceRate.projectBasis ? 'none' : 'inline';
        }   
    }   
    
    document.getElementById('addRateButton').addEventListener('click', () => addServiceRateField());

    function updateServiceDropdowns() {
        document.querySelectorAll('.service-rate select[name="serviceName"]').forEach(select => {
            const selectedValue = select.value;
            select.querySelectorAll('option').forEach(option => {
                option.disabled = selectedServices.has(option.value) && option.value !== selectedValue;
            });
        });
    }
      

    function addTeammateField(teammateData = null) {
        console.log("Adding teammate field with data:", teammateData); // Debug: log data being used
        const container = document.getElementById('teammateDetailsContainer');
        const div = document.createElement('div');
        div.className = 'teammate-details';
        div.innerHTML = `
            <!-- First Line -->
            <div class="row">
                <input type="text" name="teammateNames" placeholder="Teammate Names">
                <input type="text" name="panCardNo" placeholder="PAN Card Number">
            </div>
        
            <!-- Second Line -->
            <div class="row">
                <input type="email" name="email" placeholder="Email">
                <input type="text" name="phone" placeholder="Phone Number">
            </div>
        
            <!-- Third Line -->
            <div class="row">
                <input type="text" name="paymentDetails" placeholder="Payment Details">
            </div>
        
            <!-- Fourth Line -->
            <div class="row full-width">
                <button type="button" class="toggle-notes">Add Notes</button>
                <input type="text" class="notes-input" name="notes" placeholder="Additional Notes (Optional)">
            </div>
        
            <!-- Fifth Line -->
            <div class="row full-width">
                <button type="button" class="delete-teammate">Delete Teammate</button>
            </div>
        `;
        container.appendChild(div);
    
       // Adding event listener to the delete button to remove the teammate div
        div.querySelector('.delete-teammate').addEventListener('click', function() {
            div.remove();
        });
       // If teammateData is provided, populate the fields with the provided data
        if (teammateData) {
            div.querySelector('input[name="teammateNames"]').value = teammateData.names || '';
            div.querySelector('input[name="panCardNo"]').value = teammateData.panCardNo || '';
            div.querySelector('input[name="email"]').value = teammateData.email || '';
            div.querySelector('input[name="phone"]').value = teammateData.phone || '';
            div.querySelector('input[name="paymentDetails"]').value = teammateData.paymentDetails || '';
            div.querySelector('input[name="notes"]').value = teammateData.notes || '';
        }

        const paymentAtCompanyLevel = document.getElementById('paymentAtCompanyLevel').checked;
        togglePaymentDetails(paymentAtCompanyLevel);
    }
    

});