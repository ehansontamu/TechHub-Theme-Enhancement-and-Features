(function addPerformanceTab() {
    var JSON_URL = 'https://store-jsj7fos9p1.mybigcommerce.com/content/JSON%20Files/filteredResponse.json';
    var DISCONTINUED_BIGCOMMERCE_CATEGORY_IDS = [49, 50, 51, 52];

	function normalizeSku(value) {
		return String(value || '').trim().toUpperCase();
	}

	function skuMatchesByPrefix(a, b) {
		var left = normalizeSku(a);
		var right = normalizeSku(b);

		if (!left || !right) {
			return false;
		}

		return left.indexOf(right) === 0 || right.indexOf(left) === 0;
	}

    function getCurrentSku() {
        var skuElement = document.querySelector('.productView-info-value[data-product-sku]');
        if (!skuElement) {
            return '';
        }
        return normalizeSku(skuElement.textContent || '');
    }

    function parseScore(value) {
        var num = Number(value);
        return Number.isFinite(num) ? num : null;
    }

    function parsePrice(value) {
        var num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : null;
    }

    function getComputerType(category) {
        if (!category || typeof category !== 'string') {
            return null;
        }

        if (category.indexOf('Laptops') === 0) {
            return 'Laptop';
        }

        if (category.indexOf('Desktops') === 0) {
            return 'Desktop';
        }

        return null;
    }

    function normalizeArchitecture(value) {
        var text = String(value || '').trim();
        if (text === 'ARM') {
            return 'ARM';
        }
        if (text === 'x86') {
            return 'x86';
        }
        return '';
    }

    function normalizeGpuType(value) {
        var text = String(value || '').trim();
        if (text === 'Integrated') {
            return 'Integrated';
        }
        if (text === 'Discrete') {
            return 'Discrete';
        }
        return '';
    }

    function hasCompleteScores(item) {
        var scores = [
            parseScore(item.OverallScore),
            parseScore(item.CPUScore),
            parseScore(item.GPUScore),
            parseScore(item.MemoryScore),
            parseScore(item.StorageScore)
        ];

        return scores.every(function(score) {
            return score !== null && score > 0;
        });
    }

    function isPerformanceRecord(item) {
        return !!getComputerType(item.Category) && hasCompleteScores(item) && parsePrice(item.NormalPrice) !== null;
    }

    function isDiscontinuedProduct(item) {
        if (!item || !Array.isArray(item.BigCommerceCategoryIds)) {
            return false;
        }

        return item.BigCommerceCategoryIds.some(function(categoryId) {
            return DISCONTINUED_BIGCOMMERCE_CATEGORY_IDS.indexOf(categoryId) !== -1;
        });
    }

    function isEligibleComputer(item) {
        return isPerformanceRecord(item) &&
            Array.isArray(item.BigCommerceCategoryIds) &&
            !isDiscontinuedProduct(item);
    }

    function formatMetricNumber(value, decimals) {
        if (value === null || value === undefined || !Number.isFinite(value)) {
            return 'N/A';
        }

        if (typeof decimals === 'number') {
            return value.toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        }

        return value.toLocaleString();
    }

    function buildMetricData(items, currentItem, fieldName, label) {
        var currentValue = parseScore(currentItem[fieldName]);

        if (currentValue === null || currentValue <= 0) {
            return null;
        }

        var comparable = items
            .map(function(item) {
                return {
                    sku: normalizeSku(item.sku),
                    value: parseScore(item[fieldName])
                };
            })
            .filter(function(item) {
                return item.value !== null && item.value > 0;
            })
            .sort(function(a, b) {
                return b.value - a.value;
            });

        if (!comparable.length) {
            return null;
        }

        var rank = comparable.findIndex(function(item) {
            return item.sku === normalizeSku(currentItem.sku);
        });

        var values = comparable.map(function(item) {
            return item.value;
        });

        var maxValue = Math.max.apply(null, values);
        var minValue = Math.min.apply(null, values);
        var avgValue = values.reduce(function(sum, value) {
            return sum + value;
        }, 0) / values.length;

        return {
            label: label,
            value: currentValue,
            maxValue: maxValue,
            minValue: minValue,
            avgValue: avgValue,
            rank: rank >= 0 ? rank + 1 : null,
            total: comparable.length,
            decimals: 0
        };
    }

    function buildPricePerformanceMetricData(items, currentItem, label) {
        function getValue(item) {
            var overall = parseScore(item.OverallScore);
            var price = parsePrice(item.NormalPrice);

            if (overall === null || overall <= 0 || price === null || price <= 0) {
                return null;
            }

            return Math.round((overall / price) * 1000);
        }

        var currentValue = getValue(currentItem);

        if (currentValue === null || currentValue <= 0) {
            return null;
        }

        var comparable = items
            .map(function(item) {
                return {
                    sku: normalizeSku(item.sku),
                    value: getValue(item)
                };
            })
            .filter(function(item) {
                return item.value !== null && item.value > 0;
            })
            .sort(function(a, b) {
                return b.value - a.value;
            });

        if (!comparable.length) {
            return null;
        }

        var rank = comparable.findIndex(function(item) {
            return item.sku === normalizeSku(currentItem.sku);
        });

        var values = comparable.map(function(item) {
            return item.value;
        });

        var maxValue = Math.max.apply(null, values);
        var minValue = Math.min.apply(null, values);
        var avgValue = values.reduce(function(sum, value) {
            return sum + value;
        }, 0) / values.length;

        return {
            label: label,
            value: currentValue,
            maxValue: maxValue,
            minValue: minValue,
            avgValue: avgValue,
            rank: rank >= 0 ? rank + 1 : null,
            total: comparable.length,
            decimals: 0
        };
    }

    function createMetricRow(metric) {
        var row = document.createElement('div');
        row.style.marginBottom = '30px';
        row.style.width = '100%';

        var title = document.createElement('div');
        title.style.marginBottom = '18px';
        title.innerHTML = '<strong>' + metric.label + '</strong>';

        var barArea = document.createElement('div');
        barArea.style.position = 'relative';
        barArea.style.width = '100%';
        barArea.style.paddingTop = '20px';

        var valueLabel = document.createElement('div');
        valueLabel.style.position = 'absolute';
        valueLabel.style.top = '0';
        valueLabel.style.fontSize = '15px';
        valueLabel.style.fontWeight = '700';
        valueLabel.style.color = '#000000';
        valueLabel.style.whiteSpace = 'nowrap';
        valueLabel.style.zIndex = '4';
        valueLabel.style.transition = 'left 320ms ease, transform 320ms ease';

        var barWrap = document.createElement('div');
        barWrap.style.position = 'relative';
        barWrap.style.height = '22px';
        barWrap.style.background = '#e9e9e9';
        barWrap.style.border = '1px solid #222222';
        barWrap.style.boxSizing = 'border-box';
        barWrap.style.borderRadius = '0';
        barWrap.style.overflow = 'hidden';
        barWrap.style.width = '100%';

        var bar = document.createElement('div');
        bar.style.position = 'absolute';
        bar.style.left = '0';
        bar.style.top = '0';
        bar.style.height = '100%';
        bar.style.background = '#500000';
        bar.style.borderRadius = '0';
        bar.style.transition = 'width 320ms ease';

        var avgLine = document.createElement('div');
        avgLine.style.position = 'absolute';
        avgLine.style.left = '50%';
        avgLine.style.top = '0';
        avgLine.style.bottom = '0';
        avgLine.style.width = '3px';
        avgLine.style.background = '#ffffff';
        avgLine.style.transform = 'translateX(-50%)';
        avgLine.style.zIndex = '3';
        avgLine.style.boxShadow = '0 0 0 1px #000000';

        barWrap.appendChild(bar);
        barWrap.appendChild(avgLine);

        barArea.appendChild(valueLabel);
        barArea.appendChild(barWrap);

        var labelsRow = document.createElement('div');
        labelsRow.style.position = 'relative';
        labelsRow.style.height = '18px';
        labelsRow.style.marginTop = '4px';
        labelsRow.style.fontSize = '12px';
        labelsRow.style.opacity = '0.85';

        var avgLabel = document.createElement('div');
        avgLabel.textContent = 'Average';
        avgLabel.style.position = 'absolute';
        avgLabel.style.left = '50%';
        avgLabel.style.transform = 'translateX(-50%)';
        avgLabel.style.fontWeight = '600';
        avgLabel.style.color = '#444';

        labelsRow.appendChild(avgLabel);

        var meta = document.createElement('div');
        meta.style.marginTop = '4px';
        meta.style.fontSize = '16px';
        meta.style.opacity = '0.85';

        row.appendChild(title);
        row.appendChild(barArea);
        row.appendChild(labelsRow);
        row.appendChild(meta);

        function applyMetric(nextMetric, animate) {
            var avg = nextMetric.avgValue;
            var min = nextMetric.minValue;
            var max = nextMetric.maxValue;
            var value = nextMetric.value;
            var decimals = typeof nextMetric.decimals === 'number' ? nextMetric.decimals : 0;

            var maxDeviation = Math.max(
                Math.abs(max - avg),
                Math.abs(avg - min),
                1
            );

            var scaleMin = avg - maxDeviation;
            var scaleMax = avg + maxDeviation;

            var normalizedPercent = ((value - scaleMin) / (scaleMax - scaleMin)) * 100;
            normalizedPercent = Math.max(0, Math.min(100, normalizedPercent));

            var labelTransform = 'translateX(-50%)';
            if (normalizedPercent <= 6) {
                labelTransform = 'translateX(0)';
            } else if (normalizedPercent >= 94) {
                labelTransform = 'translateX(-100%)';
            }

            if (!animate) {
                var oldBarTransition = bar.style.transition;
                var oldLabelTransition = valueLabel.style.transition;

                bar.style.transition = 'none';
                valueLabel.style.transition = 'none';

                bar.style.width = normalizedPercent + '%';
                valueLabel.style.left = normalizedPercent + '%';
                valueLabel.style.transform = labelTransform;

                bar.offsetHeight;

                bar.style.transition = oldBarTransition;
                valueLabel.style.transition = oldLabelTransition;
            } else {
                bar.style.width = normalizedPercent + '%';
                valueLabel.style.left = normalizedPercent + '%';
                valueLabel.style.transform = labelTransform;
            }

            valueLabel.textContent = formatMetricNumber(nextMetric.value, decimals);

            title.innerHTML = '<strong>' + nextMetric.label + '</strong>';

            meta.innerHTML =
                '<strong>Rank: ' + (nextMetric.rank !== null ? nextMetric.rank : 'N/A') +
                ' of ' + nextMetric.total + '</strong>' +
                ' • Average: ' + formatMetricNumber(nextMetric.avgValue, decimals) +
                ' • Top: ' + formatMetricNumber(nextMetric.maxValue, decimals);
        }

        applyMetric(metric, false);

        return {
            element: row,
            update: applyMetric
        };
    }

    function createSectionHeading(text, marginTop) {
        var heading = document.createElement('h3');
        heading.textContent = text;
        heading.style.marginTop = marginTop || '0';
        heading.style.marginBottom = '14px';
        return heading;
    }

    function createScatterplotSection(allData, currentItem) {
        var currentType = getComputerType(currentItem.Category);
        var currentArchitecture = normalizeArchitecture(currentItem.Architecture);
        var currentGpuType = normalizeGpuType(currentItem.GPUType);
        var pageSkuPrefix = normalizeSku(currentItem.pageSkuPrefix || currentItem.sku);

        var section = document.createElement('div');
        section.style.marginTop = '34px';
        section.style.width = '100%';

        var heading = createSectionHeading('Price vs Performance', '30px');
        section.appendChild(heading);

        var intro = document.createElement('div');
        intro.style.fontSize = '14px';
        intro.style.lineHeight = '1.5';
        intro.style.marginBottom = '14px';
        intro.textContent =
            'Hover over a point to preview a product. Click a point to pin its details below the chart.';
        section.appendChild(intro);

        var controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.flexWrap = 'wrap';
        controls.style.alignItems = 'flex-start';
        controls.style.gap = '18px';
        controls.style.marginBottom = '14px';
        controls.style.width = '100%';

        var scopeGroup = document.createElement('div');
        scopeGroup.style.display = 'flex';
        scopeGroup.style.flexDirection = 'column';
        scopeGroup.style.gap = '6px';

        var scopeLabel = document.createElement('label');
        scopeLabel.textContent = 'Device Type:';
        scopeLabel.style.fontWeight = '600';
        scopeLabel.setAttribute('for', 'performance-scatter-scope');

        var scopeSelect = document.createElement('select');
        scopeSelect.id = 'performance-scatter-scope';
        scopeSelect.style.padding = '6px 10px';
        scopeSelect.style.border = '1px solid #ccc';
        scopeSelect.style.borderRadius = '6px';
        scopeSelect.style.background = '#fff';

        var optionCurrent = document.createElement('option');
        optionCurrent.value = 'current';
        optionCurrent.textContent = 'Only ' + currentType + 's';

        var optionBoth = document.createElement('option');
        optionBoth.value = 'both';
        optionBoth.textContent = 'Both Laptops and Desktops';

        scopeSelect.appendChild(optionCurrent);
        scopeSelect.appendChild(optionBoth);

        scopeGroup.appendChild(scopeLabel);
        scopeGroup.appendChild(scopeSelect);

        var metricGroup = document.createElement('div');
        metricGroup.style.display = 'flex';
        metricGroup.style.flexDirection = 'column';
        metricGroup.style.gap = '6px';

        var metricLabel = document.createElement('label');
        metricLabel.textContent = 'Performance metric:';
        metricLabel.style.fontWeight = '600';
        metricLabel.setAttribute('for', 'performance-scatter-metric');

        var metricSelect = document.createElement('select');
        metricSelect.id = 'performance-scatter-metric';
        metricSelect.style.padding = '6px 10px';
        metricSelect.style.border = '1px solid #ccc';
        metricSelect.style.borderRadius = '6px';
        metricSelect.style.background = '#fff';

        [
            { value: 'OverallScore', text: 'Overall Performance Score' },
            { value: 'CPUScore', text: 'CPU Score' },
            { value: 'GPUScore', text: 'GPU Score' },
            { value: 'MemoryScore', text: 'Memory Score' },
            { value: 'StorageScore', text: 'Storage Score' }
        ].forEach(function(optionInfo) {
            var opt = document.createElement('option');
            opt.value = optionInfo.value;
            opt.textContent = optionInfo.text;
            metricSelect.appendChild(opt);
        });

        metricGroup.appendChild(metricLabel);
        metricGroup.appendChild(metricSelect);

        var architectureGroup = document.createElement('div');
        architectureGroup.style.display = currentArchitecture ? 'flex' : 'none';
        architectureGroup.style.flexDirection = 'column';
        architectureGroup.style.gap = '6px';

        var architectureHeading = document.createElement('div');
        architectureHeading.style.fontWeight = '600';

        var architectureLink = document.createElement('a');
        architectureLink.href = 'https://tamu.mybigcommerce.com/ai-and-your-technology/#:~:text=time%20AI%20capabilities.-,PROCESSOR%20(CPU)%20TYPES,-ARM';
        architectureLink.target = '_blank';
        architectureLink.rel = 'noopener noreferrer';
        architectureLink.textContent = 'Architecture:';
        architectureLink.style.color = '#500000';
        architectureLink.style.textDecoration = 'underline';

        architectureHeading.appendChild(architectureLink);

        var architectureWrap = document.createElement('label');
        architectureWrap.style.display = 'inline-flex';
        architectureWrap.style.alignItems = 'center';
        architectureWrap.style.gap = '6px';
        architectureWrap.style.cursor = 'pointer';

        var architectureCheckbox = document.createElement('input');
        architectureCheckbox.type = 'checkbox';
        architectureCheckbox.id = 'performance-scatter-architecture-only';
        architectureCheckbox.style.cursor = 'pointer';

        var architectureText = document.createElement('span');
        architectureText.textContent = currentArchitecture + ' only';

        architectureWrap.appendChild(architectureCheckbox);
        architectureWrap.appendChild(architectureText);

        architectureGroup.appendChild(architectureHeading);
        architectureGroup.appendChild(architectureWrap);

        var gpuTypeGroup = document.createElement('div');
        gpuTypeGroup.style.display = currentGpuType ? 'flex' : 'none';
        gpuTypeGroup.style.flexDirection = 'column';
        gpuTypeGroup.style.gap = '6px';

        var gpuTypeHeading = document.createElement('div');
        gpuTypeHeading.textContent = 'GPU Type:';
        gpuTypeHeading.style.fontWeight = '600';

        var gpuTypeWrap = document.createElement('label');
        gpuTypeWrap.style.display = 'inline-flex';
        gpuTypeWrap.style.alignItems = 'center';
        gpuTypeWrap.style.gap = '6px';
        gpuTypeWrap.style.cursor = 'pointer';

        var gpuTypeCheckbox = document.createElement('input');
        gpuTypeCheckbox.type = 'checkbox';
        gpuTypeCheckbox.id = 'performance-scatter-gputype-only';
        gpuTypeCheckbox.style.cursor = 'pointer';

        var gpuTypeText = document.createElement('span');
        gpuTypeText.textContent = currentGpuType + ' only';

        gpuTypeWrap.appendChild(gpuTypeCheckbox);
        gpuTypeWrap.appendChild(gpuTypeText);

        gpuTypeGroup.appendChild(gpuTypeHeading);
        gpuTypeGroup.appendChild(gpuTypeWrap);

        function applyResponsiveControlLayout() {
            var isMobile = window.innerWidth <= 600;

            if (isMobile) {
                controls.style.flexDirection = 'column';
                controls.style.gap = '14px';

                scopeGroup.style.width = '100%';
                metricGroup.style.width = '100%';
                architectureGroup.style.width = '100%';
                gpuTypeGroup.style.width = '100%';

                scopeGroup.style.flex = 'none';
                metricGroup.style.flex = 'none';
                architectureGroup.style.flex = 'none';
                gpuTypeGroup.style.flex = 'none';

                scopeSelect.style.width = '100%';
                metricSelect.style.width = '100%';
            } else {
                controls.style.flexDirection = 'row';
                controls.style.gap = '18px';

                scopeGroup.style.width = '';
                metricGroup.style.width = '';
                architectureGroup.style.width = '';
                gpuTypeGroup.style.width = '';

                scopeGroup.style.flex = '0 0 auto';
                metricGroup.style.flex = '0 0 auto';
                architectureGroup.style.flex = '0 0 auto';
                gpuTypeGroup.style.flex = '0 0 auto';

                scopeSelect.style.width = '';
                metricSelect.style.width = '';
            }
        }

        var chartWrap = document.createElement('div');
        chartWrap.style.position = 'relative';
        chartWrap.style.width = '100%';
        chartWrap.style.maxWidth = '100%';
        chartWrap.style.border = '1px solid #ddd';
        chartWrap.style.borderRadius = '10px';
        chartWrap.style.background = '#fff';
        chartWrap.style.boxSizing = 'border-box';

        function applyResponsiveChartWrap() {
            if (window.innerWidth <= 600) {
                chartWrap.style.padding = '4px 4px 56px 4px';
            } else {
                chartWrap.style.padding = '12px 12px 56px 12px';
            }
        }

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        function applyResponsiveChartSize() {
            var isMobile = window.innerWidth <= 600;
            var chartWidth = isMobile ? 760 : 1000;
            var chartHeight = isMobile ? 540 : 560;

            svg.setAttribute('viewBox', '0 0 ' + chartWidth + ' ' + chartHeight);
            svg.removeAttribute('height');
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.style.width = '100%';
            svg.style.height = 'auto';
        }

        applyResponsiveControlLayout();
        applyResponsiveChartWrap();
        applyResponsiveChartSize();

        controls.appendChild(scopeGroup);
        controls.appendChild(metricGroup);
        controls.appendChild(architectureGroup);
        controls.appendChild(gpuTypeGroup);
        section.appendChild(controls);

        svg.style.display = 'block';
        svg.style.width = '100%';
        svg.style.height = 'auto';
        svg.style.overflow = 'visible';

        chartWrap.appendChild(svg);

        var baseLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        var pointsLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        var ringLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        svg.appendChild(baseLayer);
        svg.appendChild(pointsLayer);
        svg.appendChild(ringLayer);

        var tooltip = document.createElement('div');
        tooltip.style.position = 'absolute';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.background = 'rgba(17,17,17,0.94)';
        tooltip.style.color = '#fff';
        tooltip.style.padding = '8px 10px';
        tooltip.style.borderRadius = '8px';
        tooltip.style.fontSize = '12px';
        tooltip.style.lineHeight = '1.4';
        tooltip.style.maxWidth = '260px';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = '5';

        chartWrap.appendChild(tooltip);
        section.appendChild(chartWrap);

        var belowChartRow = document.createElement('div');
        belowChartRow.style.display = 'flex';
        belowChartRow.style.flexWrap = 'wrap';
        belowChartRow.style.alignItems = 'stretch';
        belowChartRow.style.gap = '14px';
        belowChartRow.style.marginTop = '14px';
        belowChartRow.style.width = '100%';
        belowChartRow.style.boxSizing = 'border-box';
        section.appendChild(belowChartRow);

        var detailBox = document.createElement('div');
        detailBox.style.flex = '1 1 420px';
        detailBox.style.minWidth = '320px';
        detailBox.style.padding = '14px';
        detailBox.style.border = '1px solid #ddd';
        detailBox.style.borderRadius = '10px';
        detailBox.style.background = '#fafafa';
        detailBox.style.fontSize = '14px';
        detailBox.style.lineHeight = '1.5';
        detailBox.style.boxSizing = 'border-box';
        belowChartRow.appendChild(detailBox);

        var rankingBox = document.createElement('div');
        rankingBox.style.flex = '1 1 420px';
        rankingBox.style.minWidth = '320px';
        rankingBox.style.padding = '14px';
        rankingBox.style.border = '1px solid #ddd';
        rankingBox.style.borderRadius = '10px';
        rankingBox.style.background = '#fafafa';
        rankingBox.style.boxSizing = 'border-box';
        rankingBox.style.position = 'relative';
        rankingBox.style.overflow = 'hidden';
        belowChartRow.appendChild(rankingBox);

        var rankingContent = document.createElement('div');
        rankingContent.style.position = 'relative';
        rankingContent.style.minHeight = '180px';
        rankingBox.appendChild(rankingContent);

        var note = document.createElement('div');
        note.style.marginTop = '10px';
        note.style.fontSize = '12px';
        note.style.opacity = '0.8';
        section.appendChild(note);

        var pinnedSku = normalizeSku(currentItem.sku);
        var pricePerformanceRowControl = null;
        var pointNodesBySku = Object.create(null);
        var pointDataBySku = Object.create(null);
        var pinnedRingNode = null;
        var resizeTimer = null;
        var animationFrameRequested = false;

        function getMetricLabel(fieldName) {
            var labels = {
                OverallScore: 'Overall Performance Score',
                CPUScore: 'CPU Score',
                GPUScore: 'GPU Score',
                MemoryScore: 'Memory Score',
                StorageScore: 'Storage Score'
            };
            return labels[fieldName] || fieldName;
        }

        function getMetricShortLabel(fieldName) {
            var labels = {
                OverallScore: 'Overall',
                CPUScore: 'CPU',
                GPUScore: 'GPU',
                MemoryScore: 'Memory',
                StorageScore: 'Storage'
            };
            return labels[fieldName] || fieldName;
        }

        function getMetricPointValue(item, metricField) {
            if (!item) {
                return null;
            }

            var fieldMap = {
                OverallScore: item.overall !== undefined ? item.overall : parseScore(item.OverallScore),
                CPUScore: item.cpu !== undefined ? item.cpu : parseScore(item.CPUScore),
                GPUScore: item.gpu !== undefined ? item.gpu : parseScore(item.GPUScore),
                MemoryScore: item.memory !== undefined ? item.memory : parseScore(item.MemoryScore),
                StorageScore: item.storage !== undefined ? item.storage : parseScore(item.StorageScore)
            };

            return Object.prototype.hasOwnProperty.call(fieldMap, metricField) ? fieldMap[metricField] : null;
        }

        function getScatterData(scope, metricField, architectureOnly, gpuTypeOnly) {
            return allData
                .filter(function(item) {
                    var type = getComputerType(item.Category);
                    if (!type) {
                        return false;
                    }

                    if (scope === 'current' && type !== currentType) {
                        return false;
                    }

                    if (!isEligibleComputer(item) || parseScore(item[metricField]) === null || parseScore(item[metricField]) <= 0) {
                        return false;
                    }

                    var itemArchitecture = normalizeArchitecture(item.Architecture);
                    var itemGpuType = normalizeGpuType(item.GPUType);

                    if (architectureOnly && currentArchitecture && itemArchitecture !== currentArchitecture) {
                        return false;
                    }

                    if (gpuTypeOnly && currentGpuType && itemGpuType !== currentGpuType) {
                        return false;
                    }

                    return true;
                })
                .map(function(item) {
                    return {
                        sku: normalizeSku(item.sku),
                        name: item.name || '',
                        category: item.Category || '',
                        type: getComputerType(item.Category),
                        architecture: normalizeArchitecture(item.Architecture),
                        gpuType: normalizeGpuType(item.GPUType),
                        overall: parseScore(item.OverallScore),
                        cpu: parseScore(item.CPUScore),
                        gpu: parseScore(item.GPUScore),
                        memory: parseScore(item.MemoryScore),
                        storage: parseScore(item.StorageScore),
                        price: parsePrice(item.NormalPrice),
                        selectedMetricValue: parseScore(item[metricField]),
                        productLink: item.ProductLink || '',
                        isCurrent: skuMatchesByPrefix(pageSkuPrefix, item.sku)
                    };
                });
        }

        function formatMaybeNumber(value) {
            return value === null || value === undefined ? 'N/A' : value.toLocaleString();
        }

        function formatPrice(value) {
            return value === null || value === undefined ? 'N/A' : '$' + value.toLocaleString();
        }

        function escapeHtml(text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function setDetailBox(item, metricField) {
            var metricLabelText = getMetricLabel(metricField);
            var metricShort = getMetricShortLabel(metricField);
            var metricValue = getMetricPointValue(item, metricField);

            if (!item) {
                detailBox.innerHTML = 'Click a point to keep a product\'s details here.';
                return;
            }

            var productLink = item.productLink || item.ProductLink || '';
            var safeName = escapeHtml(item.name || '');
            var nameHtml = productLink
                ? '<a href="' + escapeHtml(productLink) + '" target="_blank" rel="noopener noreferrer" style="color:#500000; text-decoration:underline;">' + safeName + '</a>'
                : safeName;

            detailBox.innerHTML =
                '<div style="font-weight:700; margin-bottom:6px;">' + nameHtml + '</div>' +
                '<div><strong>SKU:</strong> ' + escapeHtml(item.sku) + '</div>' +
                '<div><strong>Type:</strong> ' + escapeHtml(item.type || '') + '</div>' +
                '<div><strong>Category:</strong> ' + escapeHtml(item.category || item.Category || '') + '</div>' +
                '<div><strong>Architecture:</strong> ' + escapeHtml(item.architecture || item.Architecture || '') + '</div>' +
                '<div><strong>GPU Type:</strong> ' + escapeHtml(item.gpuType || item.GPUType || '') + '</div>' +
                '<div><strong>Normal Price:</strong> ' + formatPrice(item.price !== undefined ? item.price : parsePrice(item.NormalPrice)) + '</div>' +
                '<div><strong>' + escapeHtml(metricLabelText) + ':</strong> ' + formatMaybeNumber(metricValue) + '</div>' +
                '<div><strong>Overall:</strong> ' + formatMaybeNumber(item.overall !== undefined ? item.overall : parseScore(item.OverallScore)) + '</div>' +
                '<div><strong>CPU:</strong> ' + formatMaybeNumber(item.cpu !== undefined ? item.cpu : parseScore(item.CPUScore)) + '</div>' +
                '<div><strong>GPU:</strong> ' + formatMaybeNumber(item.gpu !== undefined ? item.gpu : parseScore(item.GPUScore)) + '</div>' +
                '<div><strong>Memory:</strong> ' + formatMaybeNumber(item.memory !== undefined ? item.memory : parseScore(item.MemoryScore)) + '</div>' +
                '<div><strong>Storage:</strong> ' + formatMaybeNumber(item.storage !== undefined ? item.storage : parseScore(item.StorageScore)) + '</div>' +
                '<div style="margin-top:8px; opacity:0.75;"><em>Chart Y-axis currently showing ' + escapeHtml(metricShort) + '.</em></div>';
        }

        function showTooltip(item, evt, metricField) {
            tooltip.innerHTML =
                '<strong>' + escapeHtml(item.name) + '</strong><br>' +
                'SKU: ' + escapeHtml(item.sku) + '<br>' +
                'Type: ' + escapeHtml(item.type || '') + '<br>' +
                'Architecture: ' + escapeHtml(item.architecture || '') + '<br>' +
                'GPU Type: ' + escapeHtml(item.gpuType || '') + '<br>' +
                'Price: ' + formatPrice(item.price) + '<br>' +
                getMetricShortLabel(metricField) + ': ' + formatMaybeNumber(item.selectedMetricValue);

            tooltip.style.display = 'block';

            var wrapRect = chartWrap.getBoundingClientRect();
            var left = evt.clientX - wrapRect.left + 12;
            var top = evt.clientY - wrapRect.top + 12;

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        }

        function hideTooltip() {
            tooltip.style.display = 'none';
        }

        function createSvgElement(tag, attrs) {
            var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
            Object.keys(attrs).forEach(function(key) {
                el.setAttribute(key, attrs[key]);
            });
            return el;
        }

        function buildPricePerformanceMetric(item) {
            if (!item) {
                return null;
            }

            var rankingPool = allData.filter(function(dataItem) {
                return getComputerType(dataItem.Category) === getComputerType(item.category || item.Category) && isEligibleComputer(dataItem);
            });

            var rankingSourceItem = {
                sku: item.sku,
                Category: item.category || item.Category,
                OverallScore: item.overall !== undefined ? item.overall : item.OverallScore,
                NormalPrice: item.price !== undefined ? item.price : item.NormalPrice
            };

            return buildPricePerformanceMetricData(
                rankingPool,
                rankingSourceItem,
                'Price to Performance Ranking'
            );
        }

        function renderPricePerformanceBox(item) {
            if (!item) {
                rankingContent.innerHTML = '<div style="font-size:14px;opacity:0.8;">No price-to-performance ranking available.</div>';
                pricePerformanceRowControl = null;
                return;
            }

            var rankingPool = allData.filter(function(dataItem) {
                return getComputerType(dataItem.Category) === getComputerType(item.category || item.Category) && isEligibleComputer(dataItem);
            });

            var rankingSourceItem = {
                sku: item.sku,
                Category: item.category || item.Category,
                OverallScore: item.overall !== undefined ? item.overall : item.OverallScore,
                NormalPrice: item.price !== undefined ? item.price : item.NormalPrice
            };

            var pricePerformanceMetric = buildPricePerformanceMetricData(
                rankingPool,
                rankingSourceItem,
                'Price to Performance Ranking (same device type)'
            );

            if (!pricePerformanceMetric) {
                rankingContent.innerHTML = '<div style="font-size:14px;opacity:0.8;">No price-to-performance ranking available.</div>';
                pricePerformanceRowControl = null;
                return;
            }

            if (!pricePerformanceRowControl) {
                rankingContent.innerHTML = '';
                pricePerformanceRowControl = createMetricRow(pricePerformanceMetric);
                rankingContent.appendChild(pricePerformanceRowControl.element);
            } else {
                pricePerformanceRowControl.update(pricePerformanceMetric, true);
            }
        }

        function ensureLegend() {
            var existingLegend = chartWrap.querySelector('.performance-scatter-legend');
            if (existingLegend) {
                existingLegend.style.left = window.innerWidth <= 600 ? '12px' : '16px';
                existingLegend.style.bottom = window.innerWidth <= 600 ? '10px' : '14px';
                existingLegend.style.gap = window.innerWidth <= 600 ? '10px' : '14px';
                existingLegend.style.fontSize = window.innerWidth <= 600 ? '12px' : '16px';
                existingLegend.style.padding = window.innerWidth <= 600 ? '6px 8px' : '8px 10px';
                return existingLegend;
            }

            var legend = document.createElement('div');
            legend.className = 'performance-scatter-legend';
            legend.style.position = 'absolute';
            legend.style.left = window.innerWidth <= 600 ? '12px' : '16px';
            legend.style.bottom = window.innerWidth <= 600 ? '10px' : '14px';
            legend.style.display = 'flex';
            legend.style.flexWrap = 'wrap';
            legend.style.gap = window.innerWidth <= 600 ? '10px' : '14px';
            legend.style.alignItems = 'center';
            legend.style.fontSize = window.innerWidth <= 600 ? '12px' : '16px';
            legend.style.lineHeight = '1.2';
            legend.style.background = 'rgba(255,255,255,0.92)';
            legend.style.padding = window.innerWidth <= 600 ? '6px 8px' : '8px 10px';
            legend.style.border = '1px solid #ddd';
            legend.style.borderRadius = '8px';
            legend.style.zIndex = '4';
            legend.style.maxWidth = 'calc(100% - 24px)';
            legend.style.boxSizing = 'border-box';

            legend.innerHTML =
                '<span style="display:inline-flex;align-items:center;white-space:nowrap;">' +
                    '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#595959;margin-right:6px;"></span>' +
                    'Other Laptop' +
                '</span>' +
                '<span style="display:inline-flex;align-items:center;white-space:nowrap;">' +
                    '<svg width="12" height="12" viewBox="0 0 24 24" style="margin-right:6px;display:block;flex:0 0 auto;">' +
                        '<polygon points="12,3 21,19 3,19" fill="#4f6fad" stroke="#ffffff" stroke-width="1.5"></polygon>' +
                    '</svg>' +
                    'Other Desktop' +
                '</span>' +
                '<span style="display:inline-flex;align-items:center;white-space:nowrap;">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" style="margin-right:6px;display:block;flex:0 0 auto;">' +
                        '<polygon points="12,1.8 14.9,8.1 21.8,8.8 16.6,13.4 18.1,20.1 12,16.6 5.9,20.1 7.4,13.4 2.2,8.8 9.1,8.1" fill="#700000" stroke="#700000" stroke-width="1.5"></polygon>' +
                    '</svg>' +
                    'Current Product' +
                '</span>';

            chartWrap.appendChild(legend);
            return legend;
        }

        function drawChartFrame(points, metricField) {
            baseLayer.innerHTML = '';

            var isMobile = window.innerWidth <= 600;
            var width = isMobile ? 760 : 1000;
            var height = isMobile ? 540 : 560;

            if (!points.length) {
                var noDataText = createSvgElement('text', {
                    x: String(width / 2),
                    y: String(height / 2),
                    'text-anchor': 'middle',
                    'font-size': isMobile ? '18' : '18',
                    fill: '#666'
                });
                noDataText.textContent = 'No scatterplot data available for the selected filters.';
                baseLayer.appendChild(noDataText);
                return null;
            }

            var margin = isMobile
                ? { top: 20, right: 16, bottom: 64, left: 62 }
                : { top: 24, right: 36, bottom: 72, left: 95 };

            var plotWidth = width - margin.left - margin.right;
            var plotHeight = height - margin.top - margin.bottom;

            var maxPrice = Math.max.apply(null, points.map(function(p) { return p.price; }));
            var maxMetric = Math.max.apply(null, points.map(function(p) { return p.selectedMetricValue; }));

            var xMax = Math.max(100, Math.ceil(maxPrice * 1.1));
            var yMax = Math.max(100, Math.ceil(maxMetric * 1.1));

            function xScale(value) {
                return margin.left + (value / xMax) * plotWidth;
            }

            function yScale(value) {
                return height - margin.bottom - (value / yMax) * plotHeight;
            }

            var bg = createSvgElement('rect', {
                x: margin.left,
                y: margin.top,
                width: plotWidth,
                height: plotHeight,
                fill: '#fcfcfc',
                stroke: '#ddd'
            });
            baseLayer.appendChild(bg);

            var tickSteps = isMobile ? 4 : 5;
            var tickFontSize = isMobile ? '11' : '12';
            var axisTitleFontSize = isMobile ? '13' : '14';

            for (var i = 0; i <= tickSteps; i++) {
                var xVal = (xMax / tickSteps) * i;
                var yVal = (yMax / tickSteps) * i;

                var gridX = xScale(xVal);
                var gridY = yScale(yVal);

                var vLine = createSvgElement('line', {
                    x1: gridX,
                    y1: margin.top,
                    x2: gridX,
                    y2: height - margin.bottom,
                    stroke: '#e7e7e7'
                });
                baseLayer.appendChild(vLine);

                var hLine = createSvgElement('line', {
                    x1: margin.left,
                    y1: gridY,
                    x2: width - margin.right,
                    y2: gridY,
                    stroke: '#e7e7e7'
                });
                baseLayer.appendChild(hLine);

                var xLabel = createSvgElement('text', {
                    x: gridX,
                    y: height - margin.bottom + 20,
                    'text-anchor': 'middle',
                    'font-size': tickFontSize,
                    fill: '#666'
                });
                xLabel.textContent = '$' + Math.round(xVal).toLocaleString();
                baseLayer.appendChild(xLabel);

                var yLabel = createSvgElement('text', {
                    x: margin.left - 8,
                    y: gridY + 4,
                    'text-anchor': 'end',
                    'font-size': tickFontSize,
                    fill: '#666'
                });
                yLabel.textContent = Math.round(yVal).toLocaleString();
                baseLayer.appendChild(yLabel);
            }

            var xAxis = createSvgElement('line', {
                x1: margin.left,
                y1: height - margin.bottom,
                x2: width - margin.right,
                y2: height - margin.bottom,
                stroke: '#333',
                'stroke-width': '1.5'
            });
            baseLayer.appendChild(xAxis);

            var yAxis = createSvgElement('line', {
                x1: margin.left,
                y1: margin.top,
                x2: margin.left,
                y2: height - margin.bottom,
                stroke: '#333',
                'stroke-width': '1.5'
            });
            baseLayer.appendChild(yAxis);

            var xAxisTitle = createSvgElement('text', {
                x: margin.left + (plotWidth / 2),
                y: height - 14,
                'text-anchor': 'middle',
                'font-size': axisTitleFontSize,
                fill: '#333'
            });
            xAxisTitle.textContent = 'Normal Price';
            baseLayer.appendChild(xAxisTitle);

            var yAxisTitleX = isMobile ? 18 : 22;
            var yAxisTitle = createSvgElement('text', {
                x: yAxisTitleX,
                y: margin.top + (plotHeight / 2),
                'text-anchor': 'middle',
                'font-size': axisTitleFontSize,
                fill: '#333',
                transform: 'rotate(-90 ' + yAxisTitleX + ' ' + (margin.top + (plotHeight / 2)) + ')'
            });
            yAxisTitle.textContent = getMetricLabel(metricField);
            baseLayer.appendChild(yAxisTitle);

            return {
                xScale: xScale,
                yScale: yScale
            };
        }

        function getPointVisuals(point) {
            var isMobile = window.innerWidth <= 600;

            if (point.isCurrent) {
                return {
                    shape: 'star',
                    fill: '#700000',
                    stroke: '#700000',
                    strokeWidth: 2,
                    outerRadius: isMobile ? 12 : 10,
                    innerRadius: isMobile ? 5.2 : 4.4
                };
            }

            if (point.type === 'Desktop') {
                return {
                    shape: 'triangle',
                    fill: '#4f6fad',
                    stroke: '#ffffff',
                    strokeWidth: 1.2,
                    radius: isMobile ? 7 : 6
                };
            }

            return {
                shape: 'circle',
                fill: '#595959',
                radius: isMobile ? 7 : 6,
                stroke: '#ffffff',
                strokeWidth: 1.2
            };
        }

        function getStarPoints(outerRadius, innerRadius) {
            var points = [];
            var angle = -Math.PI / 2;
            var step = Math.PI / 5;

            for (var i = 0; i < 10; i++) {
                var radius = i % 2 === 0 ? outerRadius : innerRadius;
                var x = Math.cos(angle) * radius;
                var y = Math.sin(angle) * radius;
                points.push(x.toFixed(2) + ',' + y.toFixed(2));
                angle += step;
            }

            return points.join(' ');
        }

        function getTrianglePoints(radius) {
            var points = [];
            var angle = -Math.PI / 2;
            var step = (Math.PI * 2) / 3;

            for (var i = 0; i < 3; i++) {
                var x = Math.cos(angle) * radius;
                var y = Math.sin(angle) * radius;
                points.push(x.toFixed(2) + ',' + y.toFixed(2));
                angle += step;
            }

            return points.join(' ');
        }

        function makePointNode(point) {
            var group = createSvgElement('g', {
                transform: 'translate(0 0)',
                opacity: '0'
            });

            var circle = createSvgElement('circle', {
                cx: '0',
                cy: '0',
                r: '0',
                opacity: '0'
            });

            var star = createSvgElement('polygon', {
                points: '',
                opacity: '0'
            });

            var triangle = createSvgElement('polygon', {
                points: '',
                opacity: '0'
            });

            group.appendChild(circle);
            group.appendChild(star);
            group.appendChild(triangle);

            group.style.cursor = 'pointer';
            group.style.transition = 'transform 320ms ease, opacity 220ms ease';
            circle.style.transition = 'r 320ms ease, fill 220ms ease, stroke 220ms ease, stroke-width 220ms ease, opacity 220ms ease';
            star.style.transition = 'fill 220ms ease, stroke 220ms ease, stroke-width 220ms ease, opacity 220ms ease';
            triangle.style.transition = 'fill 220ms ease, stroke 220ms ease, stroke-width 220ms ease, opacity 220ms ease';

            group.addEventListener('mouseenter', function(evt) {
                var livePoint = pointDataBySku[group.getAttribute('data-sku')];
                if (livePoint) {
                    showTooltip(livePoint, evt, metricSelect.value);
                }
            });

            group.addEventListener('mousemove', function(evt) {
                var livePoint = pointDataBySku[group.getAttribute('data-sku')];
                if (livePoint) {
                    showTooltip(livePoint, evt, metricSelect.value);
                }
            });

            group.addEventListener('mouseleave', function() {
                hideTooltip();
            });

            group.addEventListener('click', function() {
                var livePoint = pointDataBySku[group.getAttribute('data-sku')];
                if (!livePoint) {
                    return;
                }
                pinnedSku = livePoint.sku;
                renderScatterplot();
            });

            return group;
        }

        function updatePointNode(node, point, cx, cy) {
            var visuals = getPointVisuals(point);
            var circle = node.children[0];
            var star = node.children[1];
            var triangle = node.children[2];

            node.setAttribute('data-sku', point.sku);
            node.setAttribute('transform', 'translate(' + cx + ' ' + cy + ')');
            node.setAttribute('opacity', '1');

            if (visuals.shape === 'star') {
                circle.setAttribute('r', '0');
                circle.setAttribute('opacity', '0');

                triangle.setAttribute('points', '');
                triangle.setAttribute('opacity', '0');

                star.setAttribute('points', getStarPoints(visuals.outerRadius, visuals.innerRadius));
                star.setAttribute('fill', visuals.fill);
                star.setAttribute('stroke', visuals.stroke);
                star.setAttribute('stroke-width', visuals.strokeWidth);
                star.setAttribute('opacity', '1');
            } else if (visuals.shape === 'triangle') {
                circle.setAttribute('r', '0');
                circle.setAttribute('opacity', '0');

                star.setAttribute('points', '');
                star.setAttribute('opacity', '0');

                triangle.setAttribute('points', getTrianglePoints(visuals.radius + 1));
                triangle.setAttribute('fill', visuals.fill);
                triangle.setAttribute('stroke', visuals.stroke);
                triangle.setAttribute('stroke-width', visuals.strokeWidth);
                triangle.setAttribute('opacity', '1');
            } else {
                circle.setAttribute('r', visuals.radius);
                circle.setAttribute('fill', visuals.fill);
                circle.setAttribute('stroke', visuals.stroke);
                circle.setAttribute('stroke-width', visuals.strokeWidth);
                circle.setAttribute('opacity', '1');

                star.setAttribute('points', '');
                star.setAttribute('opacity', '0');

                triangle.setAttribute('points', '');
                triangle.setAttribute('opacity', '0');
            }

            pointDataBySku[point.sku] = point;
        }

        function syncPointNodes(points, scales) {
            var activeSkus = Object.create(null);

            points.forEach(function(point) {
                var cx = scales.xScale(point.price);
                var cy = scales.yScale(point.selectedMetricValue);
                var node = pointNodesBySku[point.sku];

                activeSkus[point.sku] = true;

                if (!node) {
                    node = makePointNode(point);
                    pointNodesBySku[point.sku] = node;
                    pointsLayer.appendChild(node);

                    node.setAttribute('transform', 'translate(' + cx + ' ' + cy + ')');
                    node.setAttribute('opacity', '0');

                    requestAnimationFrame(function() {
                        updatePointNode(node, point, cx, cy);
                    });
                } else {
                    updatePointNode(node, point, cx, cy);
                }
            });

            Object.keys(pointNodesBySku).forEach(function(sku) {
                if (activeSkus[sku]) {
                    return;
                }

                var node = pointNodesBySku[sku];
                node.setAttribute('opacity', '0');

                setTimeout(function() {
                    if (pointNodesBySku[sku] === node) {
                        if (node.parentNode) {
                            node.parentNode.removeChild(node);
                        }
                        delete pointNodesBySku[sku];
                        delete pointDataBySku[sku];
                    }
                }, 240);
            });
        }

        function updatePinnedRing(point, scales) {
            if (!pinnedRingNode) {
                pinnedRingNode = createSvgElement('circle', {
                    cx: 0,
                    cy: 0,
                    r: 0,
                    fill: 'none',
                    stroke: '#111',
                    'stroke-width': '1.5',
                    'stroke-dasharray': '4 3',
                    opacity: '0'
                });
                pinnedRingNode.style.transition = 'cx 320ms ease, cy 320ms ease, r 320ms ease, opacity 220ms ease';
                ringLayer.appendChild(pinnedRingNode);
            }

            if (!point || !scales) {
                pinnedRingNode.setAttribute('opacity', '0');
                return;
            }

            var visuals = getPointVisuals(point);
            var pointRadius = visuals.shape === 'star' ? visuals.outerRadius : visuals.radius;

            pinnedRingNode.setAttribute('cx', scales.xScale(point.price));
            pinnedRingNode.setAttribute('cy', scales.yScale(point.selectedMetricValue));
            pinnedRingNode.setAttribute('r', pointRadius + 6);
            pinnedRingNode.setAttribute('opacity', '1');
        }

        function renderScatterplot() {
            var scope = scopeSelect.value;
            var metricField = metricSelect.value;
            var architectureOnly = architectureCheckbox.checked;
            var gpuTypeOnly = gpuTypeCheckbox.checked;

            var points = getScatterData(scope, metricField, architectureOnly, gpuTypeOnly);

            note.textContent =
                'X-axis: Normal Price. Y-axis: ' + getMetricLabel(metricField) + '. Current product is highlighted as a maroon star.';

            ensureLegend();

            if (!points.length) {
                drawChartFrame([], metricField);
                syncPointNodes([], null);
                updatePinnedRing(null, null);
                setDetailBox(null, metricField);
                renderPricePerformanceBox(null);
                return;
            }

            var scales = drawChartFrame(points, metricField);
            syncPointNodes(points, scales);

            var pinnedPoint = points.find(function(p) {
                return p.sku === pinnedSku;
            });

            updatePinnedRing(pinnedPoint || null, scales);

            var activeItem = pinnedPoint || currentItem;
            setDetailBox(activeItem, metricField);
            renderPricePerformanceBox(activeItem);
        }

        function handleResponsiveResize() {
            if (resizeTimer) {
                clearTimeout(resizeTimer);
            }

            resizeTimer = setTimeout(function() {
                applyResponsiveControlLayout();
                applyResponsiveChartWrap();
                applyResponsiveChartSize();

                if (!animationFrameRequested) {
                    animationFrameRequested = true;
                    requestAnimationFrame(function() {
                        animationFrameRequested = false;
                        renderScatterplot();
                    });
                }
            }, 80);
        }

        window.addEventListener('resize', handleResponsiveResize);

        scopeSelect.addEventListener('change', function() {
            renderScatterplot();
        });

        metricSelect.addEventListener('change', function() {
            renderScatterplot();
        });

        architectureCheckbox.addEventListener('change', function() {
            renderScatterplot();
        });

        gpuTypeCheckbox.addEventListener('change', function() {
            renderScatterplot();
        });

        setDetailBox(currentItem, metricSelect.value);
        renderPricePerformanceBox(currentItem);
        renderScatterplot();

        return section;
    }

    function renderPerformance(tabPanel, data, currentItem) {
        var type = getComputerType(currentItem.Category);

        if (!type) {
            return;
        }

        var comparisonPool = data.filter(function(item) {
            return getComputerType(item.Category) === type && isEligibleComputer(item);
        });

        var metrics = [
            buildMetricData(comparisonPool, currentItem, 'OverallScore', 'Overall Score'),
            buildMetricData(comparisonPool, currentItem, 'CPUScore', 'CPU Score'),
            buildMetricData(comparisonPool, currentItem, 'GPUScore', 'GPU Score'),
            buildMetricData(comparisonPool, currentItem, 'MemoryScore', 'Memory Score'),
            buildMetricData(comparisonPool, currentItem, 'StorageScore', 'Storage Score')
        ].filter(Boolean);

        if (!metrics.length) {
            return;
        }

        tabPanel.innerHTML = '';
        tabPanel.style.width = '100%';
        tabPanel.style.boxSizing = 'border-box';

        var heading = document.createElement('h3');
        heading.textContent = 'Performance vs All ' + type + 's';
        tabPanel.appendChild(heading);

        var dataQuality = document.createElement('div');
        dataQuality.style.fontSize = '16px';
        dataQuality.style.opacity = '0.8';
        dataQuality.style.marginBottom = '18px';

        dataQuality.innerHTML =
            comparisonPool.length + ' TechHub ' + type.toLowerCase() +
            (comparisonPool.length === 1 ? '' : 's') +
            ' included in comparison (machines lacking performance data are not included; ' +
            '<a href="https://tamu.mybigcommerce.com/techhub-product-selection-process/#:~:text=Benchmarking%20and%20Performance%20Testing%20(Novabench)" target="_blank" style="color: inherit; text-decoration: underline;">All test scores are Novabench.</a>)';
        tabPanel.appendChild(dataQuality);

        metrics.forEach(function(metric) {
            var metricRowControl = createMetricRow(metric);
            tabPanel.appendChild(metricRowControl.element);
        });

        tabPanel.appendChild(createScatterplotSection(data, currentItem));
    }

    function createPerformanceTab(currentItem, data) {
        var tabsList = document.querySelector('.productView-description .tabs[data-tab]');
        var tabsContent = document.querySelector('.productView-description .tabs-contents');

        if (!tabsList || !tabsContent) {
            return;
        }

        if (tabsList.querySelector('a[href="#tab-performance"]') || document.getElementById('tab-performance')) {
            return;
        }

        var tabItem = document.createElement('li');
        tabItem.className = 'tab';

        var tabLink = document.createElement('a');
        tabLink.className = 'tab-title';
        tabLink.href = '#tab-performance';
        tabLink.textContent = 'Performance';
        tabItem.appendChild(tabLink);

        var tabPanel = document.createElement('div');
        tabPanel.className = 'tab-content';
        tabPanel.id = 'tab-performance';
        tabPanel.textContent = 'Loading performance data...';
        tabPanel.style.width = '100%';
        tabPanel.style.boxSizing = 'border-box';

        tabsList.appendChild(tabItem);
        tabsContent.appendChild(tabPanel);

        if (window.jQuery && window.jQuery.fn && typeof window.jQuery.fn.foundation === 'function') {
            window.jQuery(document).foundation('tab', 'reflow');
        }

        renderPerformance(tabPanel, data, currentItem);
    }

    function initPerformanceTab() {
        var currentSku = getCurrentSku();

        if (!currentSku) {
            return;
        }

        fetch(JSON_URL, { cache: 'no-store' })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Failed to load JSON');
                }
                return response.json();
            })
            .then(function(data) {
                var performanceRecords = data.filter(function(item) {
                    return isPerformanceRecord(item);
                });

			var recordsMissingCategoryIds = performanceRecords.filter(function(item) {
				return !Array.isArray(item.BigCommerceCategoryIds);
			});

			if (recordsMissingCategoryIds.length) {
				console.error(
					'Performance tab error: performance-eligible records are missing BigCommerceCategoryIds. Publish the updated filteredResponse.json before rendering the tab.',
					recordsMissingCategoryIds.map(function(item) {
						return item.sku || '(missing SKU)';
					})
				);
				return;
			}

			var exactMatch = performanceRecords.find(function(item) {
				return normalizeSku(item.sku) === currentSku;
			});

			var prefixMatches = performanceRecords.filter(function(item) {
				return skuMatchesByPrefix(currentSku, item.sku);
			});

			var currentItem = exactMatch || prefixMatches.sort(function(a, b) {
				return Math.abs(normalizeSku(a.sku).length - currentSku.length) - Math.abs(normalizeSku(b.sku).length - currentSku.length);
			})[0];

                if (!currentItem) {
                    return;
                }

                if (isDiscontinuedProduct(currentItem)) {
                    return;
                }

                var cleanData = data.filter(function(item) {
                    return isEligibleComputer(item);
                });

                currentItem.pageSkuPrefix = currentSku;

                var computerType = getComputerType(currentItem.Category);

                if (!computerType) {
                    return;
                }

                createPerformanceTab(currentItem, cleanData);
            })
            .catch(function(error) {
                console.error('Performance tab error:', error);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPerformanceTab);
        return;
    }

    initPerformanceTab();
}());
