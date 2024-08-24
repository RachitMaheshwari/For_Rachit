// Tab switching function
function openTab(evt, tabName) {
    //console.log(`Attempting to open tab: ${tabName}`);
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
        //console.log(`Tab with ID ${tabName} found.`);
        tab.classList.add("active");
    } else {
        console.error(`Tab with ID ${tabName} does not exist.`);
    }
    evt.currentTarget.className += " active";
}

document.addEventListener('DOMContentLoaded', function() {    
    const socket = io('http://localhost:3000');
    console.log('Document is ready.');
    // Initial setup for manage-companies.html
    let selectedServices = new Set();
    setupEventListeners();
    fetchCountries();
    fetchServices();  // Fetch services on page load
    populatePaymentModes();  // Populate payment modes on page load
    fetchCompanies();  // Call fetchCompanies when the DOM is fully loaded

    function setupEventListeners() {
        const addCompanyForm = document.getElementById('addCompanyForm');
        const newCompanyButton = document.getElementById('newCompanyButton');
        const companyFormContainer = document.getElementById('companyFormContainer');
        
        newCompanyButton.addEventListener('click', function() {
            resetFormAndUI();
            addCompanyForm.reset();
            document.getElementById('companyId').value = ''; // Clear company ID to indicate a new entry
            document.getElementById('companyName').disabled = false; // Enable the company name field
            document.getElementById('country').disabled = false; // Enable the country input
            companyFormContainer.style.display = 'block'; // Ensure the form is visible
        });
        
        addCompanyForm?.addEventListener('submit', function(e) {
            e.preventDefault();
            const companyId = document.getElementById('companyId').value; // Get the value from the hidden field
            const domainValue = document.getElementById('newDomain').value;  // Capture domain value
            console.log("Domain value before submission:", domainValue);  // Debug log

            // Check if last conversation date is empty
            let lastConversationDate = document.getElementById('lastConversationDate').value;
            if (!lastConversationDate) {
                if (confirm("Last Conversation Date is empty. Do you want to use today's date?")) {
                    lastConversationDate = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
                } else {
                    alert("Please enter a Last Conversation Date.");
                    return;
                }
            }

            const clientData = {
                id: companyId, // This will be empty for new companies and filled for updates
                name: document.getElementById('companyName').value,                
                address: document.getElementById('address').value,
                country: document.getElementById('country').value,
                dateCreated: document.getElementById('dateCreated').value,
                lastConversationDate: lastConversationDate, // Use the validated or prompted date
                preferredPaymentMode: document.getElementById('paymentModes').value,
                lastConversationSubject: document.getElementById('mailSubject').value,
                domain: domainValue  // Ensure the domain is captured
                // Add other fields if necessary
            };
            addClient(clientData);
        });

        const addRateButton = document.getElementById('addRateButton'); // Using optional chaining here
        addRateButton?.addEventListener('click', function() {
            addServiceRateField(true);  // Call with parameter to fetch services after adding the field
        });

        const addEmployeeButton = document.getElementById('addEmployeeButton'); // Using optional chaining here
        addEmployeeButton?.addEventListener('click', () => addEmployeeField(null)); // Pass null or the specific data structure expected

        const domainInput = document.getElementById('newDomain');
        const extractInfoButton = document.getElementById('extractInfoButton');
        const progressPercent = document.getElementById('progressPercent');

        domainInput.addEventListener('input', function() {
            const isValidDomain = validateDomain(domainInput.value);
            if (isValidDomain) {
                extractInfoButton.style.display = 'inline';
            } else {
                extractInfoButton.style.display = 'none';
                progressPercent.style.display = 'none';
            }
        });

        extractInfoButton.addEventListener('click', async function() {
            const domain = domainInput.value;
            if (!domain) {
                alert('Please enter a domain');
                return;
            }
    
            try {
                const checkResponse = await fetch('/api/checkDomain', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ domain })
                });
    
                const checkData = await checkResponse.json();
                if (checkData.exists) {
                    const proceed = confirm(`Domain already exists for company ${checkData.company.name}. Do you want to proceed?`);
                    if (!proceed) {
                        return;
                    }
                }
    
                // Show progress percentage
                progressPercent.style.display = 'inline';
                progressPercent.textContent = '0%';
    
                const response = await fetch('/api/extractEmails', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ domain })
                });
    
                if (!response.ok) {
                    throw new Error('Failed to extract emails');
                }
    
                const reader = response.body.getReader();
                const contentLength = +response.headers.get('Content-Length');
                let receivedLength = 0;
                let chunks = [];
    
                while (true) {
                    const { done, value } = await reader.read();
    
                    if (done) {
                        break;
                    }
    
                    chunks.push(value);
                    receivedLength += value.length;
    
                    // Update progress percentage
                    let progress = Math.floor((receivedLength / contentLength) * 100);
                    progressPercent.textContent = `${progress}%`;
                }
    
                const chunksAll = new Uint8Array(receivedLength);
                let position = 0;
                for (let chunk of chunks) {
                    chunksAll.set(chunk, position);
                    position += chunk.length;
                }
    
                const result = new TextDecoder("utf-8").decode(chunksAll);
                const data = JSON.parse(result);
    
                populateEmployeeFields(data.names, data.emails);
                if (data.latestDate && data.latestSubject) {
                    document.getElementById('lastConversationDate').value = new Date(data.latestDate).toISOString().split('T')[0];
                    document.getElementById('mailSubject').value = data.latestSubject;
                }
    
                // Hide progress percentage
                progressPercent.style.display = 'none';
            } catch (error) {
                console.error('Error extracting emails:', error);
                progressPercent.style.display = 'none'; // Hide progress percentage on error
            }
        });
    }

    // Domain validation function
    function validateDomain(domain) {
        const domainPattern = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return domainPattern.test(domain);
    }

    // Tab functionality
    document.querySelectorAll('.tablinks').forEach(button => {
        button.addEventListener('click', function(event) {
            const tabName = button.getAttribute('onclick').match(/'([^']+)'/)[1];
            openTab(event, tabName);
        });
    });

    // Set default open tab
    document.querySelector('.tablinks').click();

    document.getElementById('refreshEmailsButton')?.addEventListener('click', async () => {
        const domain = document.getElementById('newDomain').value;
        const progressPercent = document.getElementById('progressPercent');
        if (!domain) {
            alert('Please enter a domain');
            return;
        }
    
        // Show progress percentage
        progressPercent.style.display = 'inline';
        progressPercent.textContent = '0%';
    
        try {
            const response = await fetch('/api/extractEmails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ domain })
            });
    
            if (!response.ok) {
                throw new Error('Failed to fetch emails');
            }
    
            const reader = response.body.getReader();
            const contentLength = +response.headers.get('Content-Length');
            let receivedLength = 0;
            let chunks = [];
    
            while (true) {
                const { done, value } = await reader.read();
    
                if (done) {
                    break;
                }
    
                chunks.push(value);
                receivedLength += value.length;
    
                // Update progress percentage
                let progress = Math.floor((receivedLength / contentLength) * 100);
                progressPercent.textContent = `${progress}%`;
            }
    
            const chunksAll = new Uint8Array(receivedLength);
            let position = 0;
            for (let chunk of chunks) {
                chunksAll.set(chunk, position);
                position += chunk.length;
            }
    
            const result = new TextDecoder("utf-8").decode(chunksAll);
            const data = JSON.parse(result);
    
            populateEmployeeFields(data.names, data.emails, false);  // Append new email IDs
    
            if (data.latestDate && data.latestSubject) {
                document.getElementById('lastConversationDate').value = new Date(data.latestDate).toISOString().split('T')[0];
                document.getElementById('mailSubject').value = data.latestSubject;
            }
    
            // Hide progress percentage
            progressPercent.style.display = 'none';
        } catch (error) {
            console.error('Error fetching emails:', error);
            progressPercent.style.display = 'none'; // Hide progress percentage on error
        }
    });  
        
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

    // Function to handle bulk delete
    document.getElementById('deleteSelectedButton').addEventListener('click', function() {
        const selectedCheckboxes = document.querySelectorAll('.company-checkbox:checked');
        const idsToDelete = Array.from(selectedCheckboxes).map(checkbox => checkbox.value);

        if (idsToDelete.length === 0) {
            alert('No companies selected for deletion.');
            return;
        }

        if (confirm('Are you sure you want to delete the selected companies?')) {
            idsToDelete.forEach(id => deleteCompany(id));
        }
    });


    // Changed: Listener for toggle visibility of notes input independently
    document.getElementById('employeeDetailsContainer').addEventListener('click', function(e) {
        if (e.target.className === 'toggle-notes') {
            const notesInput = e.target.closest('.employee-details').querySelector('input[name="notes"]');
            notesInput.style.display = notesInput.style.display === 'none' ? 'inline' : 'none';
        }
    });    

    function populatePaymentModes() {
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
    }

    function addClient() {
        let method, url;
        const clientData = {
            name: document.getElementById('companyName').value,
            country: document.getElementById('country').value,
            address: document.getElementById('address').value,
            dateCreated: document.getElementById('dateCreated').value,
            lastConversationDate: document.getElementById('lastConversationDate').value,
            preferredPaymentMode: document.getElementById('paymentModes').value,
            lastConversationSubject: document.getElementById('mailSubject').value,
            domain: document.getElementById('newDomain').value,  // Capture the domain value
            services: [],
            employees: [],
            serviceRates: []
        };
    
        const companyId = document.getElementById('companyId').value;
        if (companyId) {
            // This is an update
            method = 'PUT';
            url = `/api/companies/${companyId}`;
        } else {
            // This is a new company
            method = 'POST';
            url = '/api/companies';
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
    
        // Assign the serviceRates array to the clientData
        clientData.serviceRates = serviceRates;
    
        // Collect employee data
        document.querySelectorAll('.employee-details').forEach(div => {
            clientData.employees.push({
                name: div.querySelector('[name="employeeName"]').value,
                role: div.querySelector('[name="role"]').value,
                email: div.querySelector('[name="email"]').value,
                is_active: div.querySelector('[name="stillWorking"]').checked,
                linkedin_link: div.querySelector('[name="linkedInLink"]').value,
                should_mail: div.querySelector('[name="shouldMail"]').checked,
                notes: div.querySelector('[name="notes"]').value
            });
        });
    
        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(clientData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Company updated:', data);
            fetchCompanies(); // Refresh the companies list
            resetFormAndUI(); // Reset the form and any UI components
        })
        .catch(error => console.error('Error updating company:', error));
    }

    function resetFormAndUI() {
        console.log('Resetting form and UI elements...');
        addCompanyForm.reset(); // Resets the form fields
        //document.getElementById('addCompanyForm').reset(); Resets the form fields
        
        fetchCountries(); // Repopulate country dropdown
        fetchServices(); // Refetch and repopulate services dropdown
        populatePaymentModes(); // Repopulate payment modes dropdown
    
        const serviceRatesContainer = document.getElementById('serviceRatesContainer');
        const employeeDetailsContainer = document.getElementById('employeeDetailsContainer');
        
        // Clear the service rates and employee details containers
        serviceRatesContainer.innerHTML = '';
        employeeDetailsContainer.innerHTML = '';
    
        // Reinitialize the containers with necessary buttons and fields
        addInitialServiceRateButton(); // Function to add "Add Rates for Services" button
        addInitialEmployeeButton(); // Function to add "Add Employee" button
        
        selectedServices.clear(); // Clear selected services set

        // Reset domain input and hide the "Extract Information" & "Refresh Emails" button
        document.getElementById('newDomain').value = '';
        document.getElementById('refreshEmailsButton').style.display = 'none';
        document.getElementById('extractInfoButton').style.display = 'none';
        document.getElementById('progressPercent').style.display = 'none';
        
        // Enable the companyName and country input fields for new company entries
        document.getElementById('companyName').disabled = false;
        document.getElementById('country').disabled = false;

        // Check if companyId field is empty, then clear all form fields
        const companyIdField = document.getElementById('companyId');
        if (companyIdField.value === '') {
            document.getElementById('companyName').value = '';
            document.getElementById('country').value = '';
            document.getElementById('address').value = '';
            document.getElementById('dateCreated').value = '';
            document.getElementById('lastConversationDate').value = '';
            document.getElementById('paymentModes').value = '';
            document.getElementById('mailSubject').value = '';
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
    
    function addInitialEmployeeButton() {
        console.log('Adding initial employee button...');
        const container = document.getElementById('employeeDetailsContainer');
        const button = document.createElement('button');
        button.textContent = 'Add Employee';
        button.id = 'addEmployeeButton';
        button.type = 'button';
        button.addEventListener('click', addEmployeeField);
        container.appendChild(button);
    }
    


    function fetchClients() {
        fetch('/api/companies')
            .then(response => response.json())
            .then(companies => {
                const clientSelect = document.getElementById('clientName'); // Adjust if your select ID differs
                if (clientSelect) {
                    clientSelect.innerHTML = ''; // Clear existing options
                    companies.forEach(company => {
                        const option = new Option(company.name, company.id);
                        clientSelect.add(option);
                    });
                }
            })
            .catch(error => console.error('Error fetching companies:', error));
    }
    

    function fetchCountries() {
        const countrySelect = document.getElementById('country');
        if (countrySelect) {
            countrySelect.innerHTML = ''; // Clear existing options
            const placeholderOption = new Option('Select Country', '');
            countrySelect.appendChild(placeholderOption);
    
            // Fetching from REST Countries API
            fetch('https://restcountries.com/v3.1/all')
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then(data => {
                    // Sort the countries array alphabetically based on the common name
                    data.sort((a, b) => a.name.common.localeCompare(b.name.common));

                    data.forEach(country => {
                        const option = new Option(country.name.common, country.name.common);
                        countrySelect.add(option);
                    });
                })
                .catch(error => console.error('Error fetching countries:', error));
        }
    }
    
    function fetchServices() {
        fetch('/api/services').then(response => response.json()).then(data => {
            window.cachedServices = data;
            updateServiceDropdowns();  // Marked change: Update dropdowns with fetched data
        }).catch(error => console.error('Error fetching services:', error));
    }

    let allCompanies = []; 
    
    function fetchCompanies() {
        //console.log("Fetching companies...");
        fetch('/api/companies')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                allCompanies = data;  // Store all companies data globally                
                const companyList = document.getElementById('companyList');                
                if (companyList) {
                    companyList.innerHTML = '';  // Clear existing list items if any
    
                    allCompanies.forEach(company => {
                        const listItem = document.createElement('li');
                        listItem.id = 'company-' + company.id;
    
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.classList.add('company-checkbox');
                        checkbox.value = company.id;
    
                        const companyName = document.createElement('span');
                        companyName.textContent = company.name;
                        companyName.onclick = function() { editCompanyDetails(company.id); };
    
                        const deleteButton = document.createElement('button');
                        deleteButton.textContent = 'Delete';
                        deleteButton.classList.add('delete-company');
                        deleteButton.onclick = function() { deleteCompany(company.id); };
    
                        listItem.appendChild(checkbox);
                        listItem.appendChild(companyName);
                        listItem.appendChild(deleteButton);
    
                        companyList.appendChild(listItem);

                        // Event listener for checkbox change
                        checkbox.addEventListener('change', handleCheckboxChange);
                    });
                } else {
                    //console.log('companyList element not found');
                }

                // Reset the form and UI elements
                resetFormAndUI();
            })
            .catch(error => {
                console.error('Error fetching companies:', error);
            });
    }

    function handleCheckboxChange() {
        const checkboxes = document.querySelectorAll('.company-checkbox');
        const deleteButton = document.getElementById('deleteSelectedButton');
        let anyChecked = false;

        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                anyChecked = true;
                checkbox.closest('li').classList.add('show-checkboxes');
            } else {
                checkbox.closest('li').classList.remove('show-checkboxes');
            }
        });

        if (anyChecked) {
            deleteButton.style.display = 'inline-block';
            checkboxes.forEach(checkbox => checkbox.closest('li').classList.add('show-checkboxes'));
        } else {
            deleteButton.style.display = 'none';
            checkboxes.forEach(checkbox => checkbox.closest('li').classList.remove('show-checkboxes'));
        }
    }


    function deleteCompany(companyId) {
        if (confirm(`Are you sure you want to delete the company with ID ${companyId}?`)) {
            fetch(`/api/companies/${companyId}`, {
                method: 'DELETE'
            })
            .then(response => {
                if (response.ok) {
                    alert('Company deleted successfully');
                    fetchCompanies(); // Refresh the companies list
                } else {
                    alert('Failed to delete the company');
                }
            })
            .catch(error => console.error('Error deleting company:', error));
        }
    }

    function editCompanyDetails(companyId) {
        console.log("Editing details for company ID:", companyId);
        const companyData = allCompanies.find(company => company.id.toString() === companyId.toString());

        // Set the companyId in the form field
        const companyIdField = document.getElementById('companyId');
        if (companyIdField) {
            companyIdField.value = companyId;
            companyIdField.disabled = true; // Disable the companyID input
        } else {
            console.error('companyId input field not found');
            return;  // Exit the function if the field isn't found
        }
        
        console.log('Domains:', companyData.domains);

        if (companyData) {
            console.log("Company Data:", companyData);
            document.getElementById('companyId').value = companyId; // Set the companyId in the hidden field

            const companyNameField = document.getElementById('companyName');
            companyNameField.value = companyData.name || '';
            companyNameField.disabled = true; // Disable the companyName input

            const countryField = document.getElementById('country');
            countryField.value = companyData.country || '';
            countryField.disabled = true; // Disable the country dropdown

            document.getElementById('address').value = companyData.address || '';
    
            // Corrected to match the date properties in your data
            document.getElementById('dateCreated').value = companyData.date_created ? companyData.date_created.substring(0, 10) : '';
            document.getElementById('lastConversationDate').value = companyData.last_conversation_date ? companyData.last_conversation_date.substring(0, 10) : '';
    
            // Ensure the payment mode dropdown is correctly populated and selected
            const paymentSelect = document.getElementById('paymentModes');
            if (paymentSelect.querySelector(`option[value="${companyData.preferred_payment_mode}"]`)) {
                paymentSelect.value = companyData.preferred_payment_mode;
            } else {
                paymentSelect.value = ''; // or set to a default unselected value
            }
    
            // Corrected to match the mail subject property in your data
            document.getElementById('mailSubject').value = companyData.last_conversation_subject || '';

            // Set the domain field
            const domainField = document.getElementById('newDomain');
            console.log('Domains:', companyData.domains); // Log domains
            if (domainField) {
                console.log('Setting domain field with:', companyData.domains);
                domainField.value = companyData.domains ? companyData.domains.join(', ') : '';
            } else {
                console.error('Domain input field not found');
            }

            // Show the "Refresh Emails" button and hide the "Extract Information" button
        document.getElementById('extractInfoButton').style.display = 'none';
        document.getElementById('refreshEmailsButton').style.display = 'inline';

            // Clear existing entries for dynamic content
            document.getElementById('serviceRatesContainer').innerHTML = '';
            document.getElementById('employeeDetailsContainer').innerHTML = '';

            // Add initial buttons for service rates and employees
            addInitialServiceRateButton();
            addInitialEmployeeButton();            

            // Initialize updated arrays for service rates and employees
            const updatedServiceRates = [];
            const updatedEmployees = [];

            // Dynamically add services and employees
            if (Array.isArray(companyData.service_rates) && companyData.service_rates.length > 0) {
                console.log("Service Rates:", companyData.service_rates);
                companyData.service_rates.forEach(serviceRate => {
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
                console.log("No service rates found for this company.");
            }            
    
            // Dynamically add employees
            if (Array.isArray(companyData.employees) && companyData.employees.length > 0) {
                console.log("Employees:", companyData.employees);
                companyData.employees.forEach(employee => {
                    const updatedEmployee = {
                        name: employee.name,
                        role: employee.role,
                        email: employee.email,
                        is_active: employee.is_active,
                        linkedin_link: employee.linkedin_link,
                        should_mail: employee.should_mail,
                        notes: employee.notes
                    };
                    updatedEmployees.push(updatedEmployee);
                    addEmployeeField(updatedEmployee);
                });
            } else {
                console.log("No employees found for this company.");
            }            

            // Update the clientData object with the updated service rates and employees
            const clientData = {
                name: companyData.name,
                country: companyData.country,
                address: companyData.address,
                dateCreated: companyData.date_created,
                lastConversationDate: companyData.last_conversation_date,
                preferredPaymentMode: companyData.preferred_payment_mode,
                lastConversationSubject: companyData.last_conversation_subject,
                domain: companyData.domains && companyData.domains[0] ? companyData.domains[0] : '',
                serviceRates: updatedServiceRates,
                employees: updatedEmployees
            };

        } else {
            console.error('Company data not found for ID:', companyId);
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
                //selectedServices.add(serviceRate.service_name?.toString() || ''); // Convert serviceRate.service_name to string or use an empty string if undefined
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

    function populateEmployeeFields(names, emails, clearExisting = true) {
        const employeeDetailsContainer = document.getElementById('employeeDetailsContainer');
        const existingEmails = new Set(
            Array.from(employeeDetailsContainer.querySelectorAll('[name="email"]')).map(input => input.value)
        );
    
        if (clearExisting) {
            employeeDetailsContainer.innerHTML = ''; // Clear existing employees if the flag is set
        }
    
        for (let i = 0; i < names.length; i++) {
            if (!existingEmails.has(emails[i])) {
                addEmployeeField({
                    name: names[i],
                    email: emails[i]
                });
            }
        }
    }  
    
   

    function addEmployeeField(employeeData = null) {
        console.log("Adding employee field with data:", employeeData); // Debug: log data being used
        const container = document.getElementById('employeeDetailsContainer');
        const div = document.createElement('div');
        div.className = 'employee-details';
        div.innerHTML = `            
            <div class="row fields-row">
                <input type="text" name="employeeName" placeholder="Employee Name">
                <input type="text" name="role" placeholder="Employee Role (e.g., Designer)">
                <input type="email" name="email" placeholder="Employee Email">
                <input type="url" name="linkedInLink" placeholder="LinkedIn Profile URL">
            </div>
            <div class="row options-row">
                <div class="left-options">
                    <label><input type="checkbox" name="stillWorking" checked> Currently Employed</label>
                    <label><input type="checkbox" name="shouldMail" checked> Include in Company Mailings</label>
                </div>
                <div class="right-options">
                    <button type="button" class="toggle-notes">Add Notes</button>
                    <button type="button" class="delete-employee">Delete Employee</button>
                </div>
            </div>
            <div class="row notes-row">
                <input type="text" class="notes-input" name="notes" placeholder="Additional Notes (Optional)" style="display: none;">
            </div>
        `;
        container.appendChild(div);
    
        // Adding event listener to the delete button to remove the employee div
        div.querySelector('.delete-employee').addEventListener('click', function() {
            div.remove();
        });

        // If employeeData is provided, populate the fields with the provided data
        if (employeeData) {
            div.querySelector('input[name="employeeName"]').value = employeeData.name || '';
            div.querySelector('input[name="role"]').value = employeeData.role || '';
            div.querySelector('input[name="email"]').value = employeeData.email || '';
            div.querySelector('input[name="linkedInLink"]').value = employeeData.linkedin_link || '';
            div.querySelector('input[name="stillWorking"]').checked = employeeData.is_active;
            div.querySelector('input[name="shouldMail"]').checked = employeeData.should_mail;
            div.querySelector('input[name="notes"]').value = employeeData.notes || '';
        }
    }  
    

});