// Global variables
let currentData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 10;
let chart = null;
const API_BASE_URL = 'http://localhost:3000';
let multiSelects = {};
let partnerFilterLocked = false;
let currentDashboardType = 'adsense'; // 'adsense' or 'admanager'

// --- Multi-select (Domain) ---
class MultiSelect {
    constructor(config) {
        this.config = config;
        this.selectedValues = new Set();
        this.options = [];
        this.filteredOptions = [];
        this.isOpen = false;
        
        this.initElements();
        this.bindEvents();
    }
    
    initElements() {
        this.container = document.getElementById(this.config.containerId);
        this.input = document.getElementById(this.config.inputId);
        this.dropdown = document.getElementById(this.config.dropdownId);
        this.search = document.getElementById(this.config.searchId);
        this.optionsContainer = document.getElementById(this.config.optionsId);
        this.selectAll = document.getElementById(this.config.selectAllId);
        this.selectAllCheckbox = document.getElementById(this.config.selectAllCheckboxId);
        this.arrow = document.getElementById(this.config.arrowId);
        this.placeholder = document.getElementById(this.config.placeholderId);
        this.selectedTags = document.getElementById(this.config.selectedTagsId);
        this.hiddenSelect = document.getElementById(this.config.hiddenSelectId);
    }
    
    bindEvents() {
        // Toggle dropdown
        this.input.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // Search functionality
        this.search.addEventListener('input', (e) => {
            this.filterOptions(e.target.value);
        });
        
        // Select all functionality
        this.selectAll.addEventListener('click', () => {
            this.toggleSelectAll();
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.close();
            }
        });
        
        // Prevent dropdown from closing when clicking inside
        this.dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    setOptions(options) {
        this.options = options;
        this.filteredOptions = [...options];
        this.renderOptions();
    }
    
    renderOptions() {
        this.optionsContainer.innerHTML = '';
        
        // Sort options: selected first, then alphabetically
        const sortedOptions = [...this.filteredOptions].sort((a, b) => {
            const aSelected = this.selectedValues.has(a);
            const bSelected = this.selectedValues.has(b);
            
            if (aSelected && !bSelected) return -1;
            if (!aSelected && bSelected) return 1;
            return a.localeCompare(b);
        });
        
        sortedOptions.forEach(option => {
            const optionEl = document.createElement('div');
            optionEl.className = `dropdown-option ${this.selectedValues.has(option) ? 'selected' : ''}`;
            optionEl.innerHTML = `
                <div class="option-checkbox ${this.selectedValues.has(option) ? 'checked' : ''}"></div>
                <span>${option}</span>
            `;
            
            optionEl.addEventListener('click', () => {
                this.toggleOption(option);
            });
            
            this.optionsContainer.appendChild(optionEl);
        });
        
        this.updateSelectAllState();
    }
    
    filterOptions(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredOptions = this.options.filter(option => 
            option.toLowerCase().includes(term)
        );
        this.renderOptions();
    }
    
    toggleOption(option) {
        if (this.selectedValues.has(option)) {
            this.selectedValues.delete(option);
        } else {
            this.selectedValues.add(option);
        }
        this.updateDisplay();
        this.renderOptions();
    }
    
    toggleSelectAll() {
        const allSelected = this.filteredOptions.every(option => 
            this.selectedValues.has(option)
        );
        
        if (allSelected) {
            // Deselect all filtered options
            this.filteredOptions.forEach(option => {
                this.selectedValues.delete(option);
            });
        } else {
            // Select all filtered options
            this.filteredOptions.forEach(option => {
                this.selectedValues.add(option);
            });
        }
        
        this.updateDisplay();
        this.renderOptions();
    }
    
    updateSelectAllState() {
        const allSelected = this.filteredOptions.length > 0 && 
            this.filteredOptions.every(option => this.selectedValues.has(option));
        const someSelected = this.filteredOptions.some(option => this.selectedValues.has(option));
        
        this.selectAllCheckbox.className = `option-checkbox ${allSelected ? 'checked' : ''}`;
        this.selectAll.style.opacity = someSelected && !allSelected ? '0.7' : '1';
    }
    
    updateDisplay() {
        const selectedArray = Array.from(this.selectedValues);
        
        // Update hidden select for form submission
        this.hiddenSelect.innerHTML = '';
        selectedArray.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.selected = true;
            this.hiddenSelect.appendChild(option);
        });
        
        // Update visual display
        if (selectedArray.length === 0) {
            this.placeholder.style.display = 'block';
            this.selectedTags.innerHTML = '';
        } else {
            this.placeholder.style.display = 'none';
            this.renderSelectedTags(selectedArray);
        }
        
        // Update count display - show counter when 2 or more items are selected
        if (selectedArray.length >= 2) {
            this.selectedTags.innerHTML = `<span class="selected-count">${selectedArray.length} selected</span>`;
        }
    }
    
    renderSelectedTags(selected) {
        if (selected.length <= 3) {
            this.selectedTags.innerHTML = selected.map(value => `
                <div class="selected-tag">
                    <span class="selected-tag-text">${value}</span>
                    <button class="selected-tag-remove" onclick="multiSelects.${this.config.name}.removeOption('${value}')">&times;</button>
                </div>
            `).join('');
        }
    }
    
    removeOption(option) {
        this.selectedValues.delete(option);
        this.updateDisplay();
        this.renderOptions();
    }
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    open() {
        this.isOpen = true;
        this.dropdown.classList.add('open');
        this.arrow.classList.add('open');
        this.input.classList.add('active');
        this.search.focus();
        this.search.value = '';
        this.filterOptions('');
    }
    
    close() {
        this.isOpen = false;
        this.dropdown.classList.remove('open');
        this.arrow.classList.remove('open');
        this.input.classList.remove('active');
    }
    
    getSelectedValues() {
        return Array.from(this.selectedValues);
    }
    
    clear() {
        this.selectedValues.clear();
        this.updateDisplay();
        this.renderOptions();
    }
}
// --- End Multi-select ---

// --- Partner Filter ---
let selectedPartnerId = 'all';
let partnersList = [];
function initializePartnerSelect() {
    const selectInput = document.getElementById('partnerSelectInput');
    const dropdown = document.getElementById('partnerDropdown');
    const arrow = document.getElementById('partnerArrow');
    const selectedSpan = document.getElementById('partnerSelected');
    if (!selectInput || !dropdown || !arrow || !selectedSpan) {
        return;
    }
    // Open/close dropdown
    selectInput.addEventListener('click', function(e) {
        if (partnerFilterLocked) return; // Prevent opening if locked
        e.stopPropagation();
        dropdown.classList.toggle('open');
        selectInput.classList.toggle('active');
        arrow.classList.toggle('open');
    });
    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
        if (!selectInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
            selectInput.classList.remove('active');
            arrow.classList.remove('open');
        }
    });
}
function renderPartnerOptions() {
    const dropdown = document.getElementById('partnerDropdown');
    const selectedSpan = document.getElementById('partnerSelected');
    dropdown.innerHTML = '';

    // Only keep the first partner for each unique name
    const seenNames = new Set();
    const uniquePartners = partnersList.filter(partner => {
        if (seenNames.has(partner.name)) return false;
        seenNames.add(partner.name);
        return true;
    });

    uniquePartners.forEach(partner => {
        const option = document.createElement('div');
        option.className = 'partner-option' + (partner.id == selectedPartnerId ? ' selected' : '');
        option.textContent = partner.name;
        option.dataset.value = partner.id;
        option.addEventListener('click', function() {
            selectedPartnerId = partner.id;
            selectedSpan.textContent = partner.name;
            dropdown.classList.remove('open');
            document.getElementById('partnerSelectInput').classList.remove('active');
            document.getElementById('partnerArrow').classList.remove('open');
            renderPartnerOptions();
            loadFilterOptions(); // reload domains for selected partner
        });
        dropdown.appendChild(option);
    });
}
// --- End Partner Filter ---

// --- Chart Metric Filter ---
let chartMetric = 'estimated_earnings';
function initializeCustomChartMetricSelect() {
    const selectInput = document.getElementById('chartMetricSelectInput');
    const dropdown = document.getElementById('chartMetricDropdown');
    const arrow = document.getElementById('chartMetricArrow');
    const selectedSpan = document.getElementById('chartMetricSelected');
    const options = dropdown.querySelectorAll('.custom-select-option');
    // Open/close dropdown
    selectInput.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
        selectInput.classList.toggle('active');
        arrow.classList.toggle('open');
    });
    // Option selection
    options.forEach(option => {
        option.addEventListener('click', function(e) {
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedSpan.textContent = option.textContent;
            chartMetric = option.getAttribute('data-value');
            dropdown.classList.remove('open');
            selectInput.classList.remove('active');
            arrow.classList.remove('open');
            updateChart();
        });
    });
    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
        if (!selectInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
            selectInput.classList.remove('active');
            arrow.classList.remove('open');
        }
    });
    // Set default selected
    options[0].classList.add('selected');
}
// --- End Chart Metric Filter ---

// --- Dashboard Initialization and Data Loading ---
document.addEventListener('DOMContentLoaded', function() {
    initializeMultiSelects();
    initializeDashboard();
    setupEventListeners();
    initializeCustomChartMetricSelect();
    initializePartnerSelect();
    setupDashboardTabs();
});
function initializeDashboard() {
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    document.getElementById('dateFrom').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('dateTo').value = today.toISOString().split('T')[0];

    loadFilterOptions();
    
    // Show empty state for all users
    document.getElementById('totalImpressions').textContent = '0';
    document.getElementById('totalPageViews').textContent = '0';
    document.getElementById('totalRevenue').textContent = '₹0';
    document.getElementById('averageEcpm').textContent = '₹0';
    
    // Clear chart
    if (chart) {
        chart.destroy();
        chart = null;
    }
    
    // Clear table
    document.getElementById('dataTableBody').innerHTML = `
        <tr>
            <td colspan="9" class="empty-state">
                <i class="fas fa-chart-bar"></i>
                <div>Click Apply Filters to view data.</div>
            </td>
        </tr>
    `;
    
    // Update pagination
    document.getElementById('paginationInfo').textContent = 'Showing 0 of 0 results';
    document.getElementById('currentPage').textContent = '1 of 1';
    document.getElementById('prevPage').disabled = true;
    document.getElementById('nextPage').disabled = true;
    updateKPIVisibility();
}
function setupEventListeners() {
    document.getElementById('applyFilters').addEventListener('click', () => {
        // Check if user is partner and no domains are selected
        if (getUserRole() === 'partner' && multiSelects.domain.getSelectedValues().length === 0) {
            // Create toast container if it doesn't exist
            let toastContainer = document.querySelector('.toast-container');
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.className = 'toast-container';
                document.body.appendChild(toastContainer);
            }

            // Create and show toast
            const toast = document.createElement('div');
            toast.className = 'toast error';
            toast.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                Please select at least one domain
            `;
            toastContainer.appendChild(toast);

            // Remove toast after 3 seconds with animation
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease-out forwards';
                setTimeout(() => {
                    toast.remove();
                }, 300);
            }, 3000);
            
            return;
        }
        
        loadDashboardData();
    });
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.getElementById('prevPage').addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(1));
}
async function loadFilterOptions() {
    try {
        // Always use the currently selected partnerId for the query
        const response = await fetch(`${API_BASE_URL}/api/filter-options?partnerId=${selectedPartnerId}&dashboardType=${currentDashboardType}`);
        const data = await response.json();
        // Populate partners dropdown
        if (data.partners) {
            partnersList = data.partners;
            renderPartnerOptions();
        }
        // Populate domains
        if (multiSelects.domain) {
            multiSelects.domain.setOptions(data.domains);
            multiSelects.domain.clear(); // Deselect all domains when partner changes
        } else {
            console.error('Multi-select components not initialized');
        }
    } catch (error) {
        console.error('Error loading filter options:', error);
    }
}
function getFilters() {
    return {
        domains: multiSelects.domain.getSelectedValues(),
        dateFrom: document.getElementById('dateFrom').value,
        dateTo: document.getElementById('dateTo').value
    };
}
function initializeMultiSelects() {
    multiSelects.domain = new MultiSelect({
        name: 'domain',
        containerId: 'domainMultiSelect',
        inputId: 'domainMultiSelect',
        dropdownId: 'domainDropdown',
        searchId: 'domainSearch',
        optionsId: 'domainOptions',
        selectAllId: 'domainSelectAll',
        selectAllCheckboxId: 'domainSelectAllCheckbox',
        arrowId: 'domainArrow',
        placeholderId: 'domainPlaceholder',
        selectedTagsId: 'domainSelectedTags',
        hiddenSelectId: 'domainFilter'
    });
}
async function loadDashboardData() {
    showLoading(true);
    
    const filters = getFilters();
    
    try {
        // Load KPIs
        const kpiResponse = await fetch(`${API_BASE_URL}/api/kpis?dashboardType=${currentDashboardType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters)
        });
        const kpis = await kpiResponse.json();
        updateKPIs(kpis);

        // Load table data
        const tableResponse = await fetch(`${API_BASE_URL}/api/table-data?dashboardType=${currentDashboardType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters)
        });
        const tableData = await tableResponse.json();
        currentData = tableData;
        filteredData = tableData;
        updateTable();

        // Load chart data
        await updateChart();
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    } finally {
        showLoading(false);
    }
}
function updateKPIs(kpis) {
    document.getElementById('totalImpressions').textContent = formatNumber(kpis.totalImpressions);
    document.getElementById('totalPageViews').textContent = formatNumber(kpis.totalPageViews);
    document.getElementById('totalRevenue').textContent = '₹' + formatNumber(kpis.totalRevenue, 2);
    document.getElementById('averageEcpm').textContent = '₹' + formatNumber(kpis.avgEcpm, 2);
}
async function updateChart() {
    const filters = getFilters();
    try {
        const response = await fetch(`${API_BASE_URL}/api/chart-data?dashboardType=${currentDashboardType}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...filters, metric: chartMetric })
        });
        const chartData = await response.json();
        // Update chart heading based on selected metric
        const metricLabels = {
            'estimated_earnings': 'Revenue',
            'impressions': 'Impressions',
            'page_views': 'Page Views',
            'ecpm': 'eCPM'
        };
        document.querySelector('.chart-title').textContent = `${metricLabels[chartMetric]} Trend`;
        renderChart(chartData, chartMetric);
    } catch (error) {
        console.error('Error loading chart data:', error);
    }
}
function renderChart(data, metric) {
    const ctx = document.getElementById('trendsChart').getContext('2d');
    
    if (chart) {
        chart.destroy();
    }

    const metricLabels = {
        'estimated_earnings': 'Revenue (₹)',
        'impressions': 'Impressions',
        'page_views': 'Page Views',
        'ecpm': 'eCPM (₹)'
    };

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: metricLabels[metric],
                data: data.values,
                borderColor: '#000000',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onHover: (event, elements) => {
                event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#000',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderWidth: 0,
                    padding: 12,
                    displayColors: false,
                    titleFont: {
                        size: 13,
                        weight: 'normal'
                    },
                    bodyFont: {
                        size: 16,
                        weight: 'bold'
                    },
                    callbacks: {
                        label: function(context) {
                            return formatNumber(context.raw, metric === 'ecpm' || metric === 'estimated_earnings' ? 2 : 0);
                        },
                        title: function(context) {
                            return context[0].label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#e9e9e7'
                    },
                    ticks: {
                        color: '#787774'
                    }
                },
                x: {
                    grid: {
                        color: '#e9e9e7'
                    },
                    ticks: {
                        color: '#787774'
                    }
                }
            }
        }
    });
}
function updateTable() {
    const tbody = document.getElementById('dataTableBody');
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);

    if (pageData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    <i class="fas fa-search"></i>
                    <div>No data found matching your criteria.</div>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = pageData.map(row => `
            <tr>
                <td>${formatDate(row.date)}</td>
                <td>${row.domain_name}</td>
                <td>${formatNumber(row.page_views)}</td>
                <td>${formatNumber(row.impressions)}</td>
                <td>₹${formatNumber(row.page_views_rpm, 2)}</td>
                <td>₹${formatNumber(row.impressions_rpm, 2)}</td>
                <td>${formatNumber(row.active_view_viewability, 2)}%</td>
                <td>₹${formatNumber(row.estimated_earnings, 2)}</td>
                <td>₹${formatNumber(row.ecpm, 2)}</td>
            </tr>
        `).join('');
    }

    updatePagination();
    updateKPIVisibility();
}
function handleSearch() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    filteredData = currentData.filter(row => 
        row.domain_name.toLowerCase().includes(searchTerm)
    );
    currentPage = 1;
    updateTable();
}
function changePage(direction) {
    const newPage = currentPage + direction;
    const maxPage = Math.ceil(filteredData.length / itemsPerPage);
    
    if (newPage >= 1 && newPage <= maxPage) {
        currentPage = newPage;
        updateTable();
    }
}
function updatePagination() {
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    document.getElementById('paginationInfo').textContent = 
        `Showing ${startItem}-${endItem} of ${totalItems} results`;
    document.getElementById('currentPage').textContent = `${currentPage} of ${totalPages}`;
    
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
}
function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
}
function formatNumber(num, decimals = 0) {
    if (num == null || isNaN(num)) return '0';
    return Number(num).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
// --- End Dashboard Initialization and Data Loading ---

// --- Login/Logout Logic ---
const loginPage = document.getElementById('loginPage');
const dashboardContainer = document.getElementById('dashboardContainer');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

function showDashboard() {
    loginPage.style.display = 'none';
    dashboardContainer.style.display = '';
}
function showLogin() {
    dashboardContainer.style.display = 'none';
    loginPage.style.display = 'flex';
}
function isLoggedIn() {
    return localStorage.getItem('isLoggedIn') === 'true';
}
function setLoggedIn(val) {
    localStorage.setItem('isLoggedIn', val ? 'true' : 'false');
}
function setUserRole(role) {
    localStorage.setItem('userRole', role);
}
function getUserRole() {
    return localStorage.getItem('userRole');
}
function setPartnerName(name) {
    localStorage.setItem('partnerName', name);
}
function getPartnerName() {
    return localStorage.getItem('partnerName');
}
function clearUserRole() {
    localStorage.removeItem('userRole');
    localStorage.removeItem('partnerName');
}
// On page load
document.addEventListener('DOMContentLoaded', function() {
    if (isLoggedIn()) {
        showDashboard();
        handlePartnerFilterLock();
    } else {
        showLogin();
    }
});
// Login form submit
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        try {
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (data.success) {
                setLoggedIn(true);
                setUserRole(data.role);
                if (data.role === 'partner') {
                    setPartnerName(data.username);
                } else {
                    setPartnerName('');
                }
                showDashboard();
                handlePartnerFilterLock();
                loginError.style.display = 'none';
                loginForm.reset();
            } else {
                loginError.style.display = 'block';
            }
        } catch (err) {
            loginError.style.display = 'block';
        }
    });
}
// Logout button
if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
        setLoggedIn(false);
        clearUserRole();
        showLogin();
    });
}

// --- Partner Filter Lock for Partner Role ---
function handlePartnerFilterLock() {
    const role = getUserRole();
    const partnerName = getPartnerName();
    const partnerSelectInput = document.getElementById('partnerSelectInput');
    const partnerDropdown = document.getElementById('partnerDropdown');
    const selectedSpan = document.getElementById('partnerSelected');
    
    if (role === 'partner' && partnerName) {
        partnerFilterLocked = true;
        
        // If the correct partner is already selected, do nothing
        if (selectedSpan.textContent === partnerName) {
            return;
        }
        
        // Wait for partnersList to be loaded and set the filter
        const setAndLock = () => {
            // Find the partner option with the correct name (case-insensitive)
            const option = Array.from(partnerDropdown.children).find(opt => opt.textContent.trim().toLowerCase() === partnerName.trim().toLowerCase());
            if (option) {
                // Only click if not already selected
                if (!option.classList.contains('selected')) {
                    selectedPartnerId = option.dataset.value;
                    selectedSpan.textContent = option.textContent;
                    loadFilterOptions().then(() => {
                        // After loading filter options, select all domains
                        if (multiSelects.domain) {
                            // Get all available domains
                            const allDomains = multiSelects.domain.options;
                            // Select all domains
                            allDomains.forEach(domain => {
                                multiSelects.domain.selectedValues.add(domain);
                            });
                            // Update the display
                            multiSelects.domain.updateDisplay();
                            multiSelects.domain.renderOptions();
                        }
                    });
                }
            } else {
                // Try again after a short delay if not loaded yet
                setTimeout(setAndLock, 100);
            }
        };
        setAndLock();
    } else {
        partnerFilterLocked = false;
    }
}

// Call handlePartnerFilterLock after partner options are rendered
const origRenderPartnerOptions = renderPartnerOptions;
renderPartnerOptions = function() {
    origRenderPartnerOptions.apply(this, arguments);
    // Only call handlePartnerFilterLock if we haven't already set the partner
    const selectedSpan = document.getElementById('partnerSelected');
    const partnerName = getPartnerName();
    if (selectedSpan.textContent !== partnerName) {
        handlePartnerFilterLock();
    }
}

// Tab switching logic
function setupDashboardTabs() {
    const adsenseTab = document.getElementById('adsenseTab');
    const adManagerTab = document.getElementById('adManagerTab');
    if (!adsenseTab || !adManagerTab) return;

    adsenseTab.addEventListener('click', function() {
        if (currentDashboardType !== 'adsense') {
            currentDashboardType = 'adsense';
            adsenseTab.classList.add('active');
            adsenseTab.style.borderBottom = '3px solid #000';
            adsenseTab.style.color = '#000';
            adManagerTab.classList.remove('active');
            adManagerTab.style.borderBottom = '3px solid transparent';
            adManagerTab.style.color = '#787774';
            initializeDashboard();
        }
    });
    adManagerTab.addEventListener('click', function() {
        if (currentDashboardType !== 'admanager') {
            currentDashboardType = 'admanager';
            adManagerTab.classList.add('active');
            adManagerTab.style.borderBottom = '3px solid #000';
            adManagerTab.style.color = '#000';
            adsenseTab.classList.remove('active');
            adsenseTab.style.borderBottom = '3px solid transparent';
            adsenseTab.style.color = '#787774';
            initializeDashboard();
        }
    });
}

function updateKPIVisibility() {
    // Hide Page Views KPI and chart option for Ad Manager
    const pageViewsKpi = document.getElementById('totalPageViews').parentElement.parentElement;
    const impressionsKpi = document.getElementById('totalImpressions').parentElement.parentElement;
    const revenueKpi = document.getElementById('totalRevenue').parentElement.parentElement;
    const ecpmKpi = document.getElementById('averageEcpm').parentElement.parentElement;
    const chartMetricDropdown = document.getElementById('chartMetricDropdown');
    const pageViewsChartOption = chartMetricDropdown.querySelector('[data-value="page_views"]');
    // Table column
    const table = document.querySelector('table');
    if (!pageViewsKpi || !impressionsKpi || !revenueKpi || !ecpmKpi || !pageViewsChartOption || !table) return;
    // Table header and all rows for Page Views
    const ths = table.querySelectorAll('th');
    const pageViewsThIndex = Array.from(ths).findIndex(th => th.textContent.trim().toLowerCase().includes('page views'));
    if (currentDashboardType === 'admanager') {
        pageViewsKpi.style.display = 'none';
        impressionsKpi.style.display = '';
        revenueKpi.style.display = '';
        ecpmKpi.style.display = '';
        pageViewsChartOption.style.display = 'none';
        // Hide Page Views column in table
        if (pageViewsThIndex !== -1) {
            ths[pageViewsThIndex].style.display = 'none';
            // Hide all td in this column
            const trs = table.querySelectorAll('tbody tr, thead tr');
            trs.forEach(tr => {
                if (tr.children[pageViewsThIndex]) tr.children[pageViewsThIndex].style.display = 'none';
            });
        }
    } else {
        pageViewsKpi.style.display = '';
        impressionsKpi.style.display = '';
        revenueKpi.style.display = '';
        ecpmKpi.style.display = '';
        pageViewsChartOption.style.display = '';
        if (pageViewsThIndex !== -1) {
            ths[pageViewsThIndex].style.display = '';
            const trs = table.querySelectorAll('tbody tr, thead tr');
            trs.forEach(tr => {
                if (tr.children[pageViewsThIndex]) tr.children[pageViewsThIndex].style.display = '';
            });
        }
    }
}
// Call updateKPIVisibility after dashboard/tab switch and after table/chart render
const origInitializeDashboard = initializeDashboard;
initializeDashboard = function() {
    origInitializeDashboard.apply(this, arguments);
    updateKPIVisibility();
}
const origSetupDashboardTabs = setupDashboardTabs;
setupDashboardTabs = function() {
    origSetupDashboardTabs.apply(this, arguments);
    updateKPIVisibility();
}
const origUpdateTable = updateTable;
updateTable = function() {
    origUpdateTable.apply(this, arguments);
    updateKPIVisibility();
}
const origUpdateChart = updateChart;
updateChart = async function() {
    await origUpdateChart.apply(this, arguments);
    updateKPIVisibility();
}