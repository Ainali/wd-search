async function searchWikidata() {
    const query = document.getElementById('search-input').value;
    const searchUrl = `https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&srlimit=50&origin=*`;

    try {
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        const resultIds = searchData.query.search.map(result => result.title);

        const resultsUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${resultIds.join('|')}&format=json&props=labels|descriptions|claims&languages=en&origin=*`;
        const resultsResponse = await fetch(resultsUrl);
        const resultsData = await resultsResponse.json();

        const results = Object.values(resultsData.entities);

        displayResults(results);
        populateFilters(results);
    } catch (error) {
        console.error('Error fetching data: ', error);
    }
}

async function getLabelsAndImagesAndClaims(entityIds) {
    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < entityIds.length; i += chunkSize) {
        chunks.push(entityIds.slice(i, i + chunkSize));
    }

    const labelsAndImagesAndClaims = {};
    for (const chunk of chunks) {
        const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join('|')}&format=json&languages=en&props=labels|claims&origin=*`;
        const response = await fetch(url);
        const data = await response.json();

        for (const id in data.entities) {
            if (data.entities[id].labels && data.entities[id].labels.en) {
                labelsAndImagesAndClaims[id] = { label: data.entities[id].labels.en.value, claims: data.entities[id].claims || {} };
            } else {
                labelsAndImagesAndClaims[id] = { label: id, claims: data.entities[id].claims || {} };
            }

            if (data.entities[id].claims && data.entities[id].claims.P18) {
                const imageFile = data.entities[id].claims.P18[0].mainsnak.datavalue.value;
                labelsAndImagesAndClaims[id].image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFile)}`;
            }
        }
    }
    return labelsAndImagesAndClaims;
}

function displayLoadingState() {
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<p>Loading...</p>';
}

function displayErrorState() {
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '<p>An error occurred while fetching the data. Please try again.</p>';
}

function displayResults(results) {
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '';

    results.forEach(result => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.dataset.properties = JSON.stringify(getPropertiesMap(result.claims));

        const title = document.createElement('h3');
        const link = document.createElement('a');
        link.href = `https://www.wikidata.org/wiki/${result.id}`;
        link.target = '_blank';
        link.textContent = `${result.labels?.en?.value || result.id} (${result.id})`;
        title.appendChild(link);

        const description = document.createElement('p');
        description.textContent = result.descriptions?.en?.value || 'No description available';

        if (result.claims.P18 && result.claims.P18[0].mainsnak.datavalue.value) {
            const imageValue = result.claims.P18[0].mainsnak.datavalue.value;
            const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${imageValue}`;
            const thumbnail = document.createElement('img');
            thumbnail.src = `${imageUrl}?width=50`;
            thumbnail.alt = imageValue;
            thumbnail.style.width = '50px';
            thumbnail.style.float = 'right';
            thumbnail.style.height = 'auto';
            resultItem.appendChild(thumbnail);
        }

        resultItem.appendChild(title);
        resultItem.appendChild(description);
        resultsDiv.appendChild(resultItem);
    });
}

// Helper function to map property-value pairs from claims
function getPropertiesMap(claims) {
    const propertiesMap = {};
    for (const prop in claims) {
        claims[prop].forEach(claim => {
            if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datatype === "wikibase-item") {
                const value = claim.mainsnak.datavalue.value.id;
                propertiesMap[prop] = value;
            }
        });
    }
    return propertiesMap;
}

async function getLabels(entityIds) {
    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < entityIds.length; i += chunkSize) {
        chunks.push(entityIds.slice(i, i + chunkSize));
    }

    const labels = {};
    for (const chunk of chunks) {
        const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join('|')}&format=json&languages=en&props=labels&origin=*`;
        const response = await fetch(url);
        const data = await response.json();

        for (const id in data.entities) {
            if (data.entities[id].labels && data.entities[id].labels.en) {
                labels[id] = data.entities[id].labels.en.value;
            } else {
            labels[id] = id;
            }
        }
    }
    return labels;
}

async function getProperties(entityId) {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${entityId}&format=json&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    return Object.keys(data.claims);
}

async function populateFilters(results) {
    const filterDiv = document.getElementById('filter-options');
    filterDiv.innerHTML = '<h2>Filter</h2>'; // Ensure the header is always present

    const properties = {};
    const allValueIds = new Set();

    for (const result of results) {
        const claims = result.claims;

        for (const prop in claims) {
            claims[prop].forEach(claim => {
                if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datatype === "wikibase-item") { // Only process "wikibase-item" type properties
                    const value = claim.mainsnak.datavalue.value.id;
                    if (value) {
                        if (!properties[prop]) {
                            properties[prop] = { count: 0, label: '', values: {} };
                        }
                        if (!properties[prop].values[value]) {
                            properties[prop].values[value] = 0;
                        }
                        properties[prop].values[value]++;
                        allValueIds.add(value);
                    }
                }
            });
        }
    }

    const propIds = Object.keys(properties);
    const propLabels = await getLabels(propIds);
    const valueLabels = await getLabels([...allValueIds]);

    for (const prop in properties) {
        properties[prop].label = propLabels[prop] || prop;
        for (const value in properties[prop].values) {
            properties[prop].values[value] = {
                count: properties[prop].values[value],
                label: valueLabels[value] || value,
            };
        }
    }

    // Filter out properties that don't have any "wikibase-item" values
    const filteredProps = Object.keys(properties).filter(prop => Object.keys(properties[prop].values).length > 0);

    const sortedProps = filteredProps.sort((a, b) => {
        const countA = Object.values(properties[a].values).reduce((sum, value) => sum + value.count, 0);
        const countB = Object.values(properties[b].values).reduce((sum, value) => sum + value.count, 0);
        return countB - countA;
    });

    const visibleProps = [];
    const hiddenProps = [];

    sortedProps.forEach(prop => {
        const totalValuesCount = Object.values(properties[prop].values).reduce((sum, value) => sum + value.count, 0);
        const propElement = document.createElement('div');
        propElement.className = 'filter-property';
        propElement.innerHTML = `<strong>${properties[prop].label} (${prop})</strong>`;

        const values = Object.entries(properties[prop].values).map(([value, { count, label }]) => `
            <div>
                <input type="checkbox" id="filter-${prop}-${value}" onchange="filterResults('${prop}', '${value}')">
                <label for="filter-${prop}-${value}">${label} (${value}) (${count})</label>
            </div>
        `).join('');

        propElement.innerHTML += values;

        if (totalValuesCount > 1) {
            visibleProps.push(propElement);
        } else {
            hiddenProps.push(propElement);
        }
    });

    visibleProps.forEach(propElement => filterDiv.appendChild(propElement));

    if (hiddenProps.length > 0) {
        const showAllBtn = document.createElement('button');
        showAllBtn.id = 'show-all-btn';
        showAllBtn.onclick = () => {
            hiddenProps.forEach(propElement => filterDiv.appendChild(propElement));
            showAllBtn.style.display = 'none';
        };
        showAllBtn.textContent = 'Show all';
        filterDiv.appendChild(showAllBtn);
    }

    const additionalFiltersDiv = document.createElement('div');
    additionalFiltersDiv.id = 'additional-filters';
    additionalFiltersDiv.style.display = 'none';
    filterDiv.appendChild(additionalFiltersDiv);
}

function showAllProperties() {
    document.getElementById('additional-filters').style.display = 'block';
    document.getElementById('show-all-btn').style.display = 'none';
}

// Function to filter the search results based on the selected filters
function filterResults(prop, value) {
    const checkboxes = document.querySelectorAll(`#filter-options input[type="checkbox"]`);
    const activeFilters = {};

    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            const [prop, value] = checkbox.id.replace('filter-', '').split('-');
            if (!activeFilters[prop]) {
                activeFilters[prop] = new Set();
            }
            activeFilters[prop].add(value);
        }
    });

    const resultsDiv = document.getElementById('search-results');
    const resultItems = resultsDiv.querySelectorAll('.result-item');

    resultItems.forEach(resultItem => {
        const resultProps = resultItem.dataset.properties ? JSON.parse(resultItem.dataset.properties) : {};
        let isVisible = true;

        for (const [filterProp, filterValues] of Object.entries(activeFilters)) {
            if (!resultProps[filterProp] || !filterValues.has(resultProps[filterProp])) {
                isVisible = false;
                break;
            }
        }

        resultItem.style.display = isVisible ? 'block' : 'none';
    });
}

document.getElementById('search-input').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        searchWikidata();
    }
});
