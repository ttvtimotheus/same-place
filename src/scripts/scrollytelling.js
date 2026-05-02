import * as d3 from 'd3';
import maplibregl from 'maplibre-gl';
import compareBundleUrl from '@maplibre/maplibre-gl-compare/dist/maplibre-gl-compare.js?url';
import regionsUrl from '../data/regions.geojson?url';

const baseStyleUrl = 'https://demotiles.maplibre.org/style.json';
const germanyCenter = [10.4515, 51.1657];
const defaultZoom = 5;
const noDataFill = '#333333';
const lightFill = '#f7f7f7';
const accentFill = '#e63946';
const outlineFill = '#181818';
const questionFill = '#4b4b4b';
const questionOpacity = 0.34;
const hoverBoundMaps = new WeakSet();
const percentFormatter = new Intl.NumberFormat('en-GB', {
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
});

const whiteToRedRamp = d3.quantize(d3.interpolateRgb(lightFill, accentFill), 5);
const neutralRamp = d3.quantize(d3.interpolateRgb('#1f1f1f', '#676767'), 5);

const scenes = [
	{
		title: 'Germany. Today.',
		description: 'Regions are coloured by AfD vote share in 2025. Grey districts are missing a reported value.',
		legend: whiteToRedRamp,
		fill: buildChoroplethExpression('afd_pct', 30),
		opacity: 0.92,
		lineColor: outlineFill,
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
	},
	{
		title: 'Has it always been like this?',
		description: 'The question scene softens the map and holds the pause before the historical jump.',
		legend: neutralRamp,
		fill: questionFill,
		opacity: questionOpacity,
		lineColor: outlineFill,
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
	},
	{
		title: 'Germany. 1933.',
		description: 'The same districts shift to NSDAP vote share in March 1933, using the full 0 to 100 percent range.',
		legend: whiteToRedRamp,
		fill: buildChoroplethExpression('nsdap_pct', 100),
		opacity: 0.92,
		lineColor: '#241816',
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
	},
	{
		title: 'Then and now.',
		description: 'Use the slider to compare the historical and current regional pattern directly.',
		legend: whiteToRedRamp,
		fill: buildChoroplethExpression('afd_pct', 30),
		opacity: 0.92,
		lineColor: outlineFill,
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
	},
	{
		title: "Some things change. Some things don't.",
		description: 'The outro shows the absolute gap between the normalised 1933 and 2025 shares across the whole country.',
		legend: whiteToRedRamp,
		fill: buildChoroplethExpression('normalized_gap', 1),
		opacity: 0.92,
		lineColor: outlineFill,
		view: {
			type: 'fitBounds',
			maxZoom: 4.65,
			padding: { top: 64, right: 72, bottom: 220, left: 72 },
		},
	},
];

const primaryShell = document.querySelector('[data-primary-shell]');
const primaryMapElement = document.querySelector('[data-map]');
const compareShell = document.querySelector('[data-compare-shell]');
const comparisonContainer = document.querySelector('[data-comparison-container]');
const compareBeforeElement = document.querySelector('[data-compare-before]');
const compareAfterElement = document.querySelector('[data-compare-after]');
const compareFallback = document.querySelector('[data-compare-fallback]');
const statusElement = document.querySelector('[data-map-status]');
const panelElement = document.querySelector('[data-panel]');
const panelStep = document.querySelector('[data-panel-step]');
const panelTitle = document.querySelector('[data-panel-title]');
const panelCopy = document.querySelector('[data-panel-copy]');
const stepElements = Array.from(document.querySelectorAll('.step'));

let primaryMap;
let compareBeforeMap;
let compareAfterMap;
let compareControl;
let activeSceneIndex = -1;
let pendingSceneIndex = 0;
let regionsData = { type: 'FeatureCollection', features: [] };
let compareConstructorPromise;
let regionsBounds = null;

if (
	primaryShell &&
	primaryMapElement &&
	compareShell &&
	comparisonContainer &&
	compareBeforeElement &&
	compareAfterElement &&
	statusElement &&
	panelElement &&
	panelStep &&
	panelTitle &&
	panelCopy
) {
	window.maplibregl = maplibregl;
	void initialiseStory();
}

async function initialiseStory() {
	regionsData = await loadRegions();
	primaryMap = createMap(primaryMapElement);
	primaryMap.on('load', () => {
		addRegionsLayers(primaryMap);
		updateMap(pendingSceneIndex);
	});
	attachMapErrorHandler(primaryMap);
	initialiseObserver();
	window.addEventListener('resize', handleResize, { passive: true });
}

function initialiseObserver() {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
					const stepIndex = Number(entry.target.getAttribute('data-step'));
					updateMap(stepIndex);
				}
			}
		},
		{ threshold: 0.5 },
	);

	for (const stepElement of stepElements) {
		observer.observe(stepElement);
	}

	updateStepState(0);
	updatePanel(0);
}

async function updateMap(stepIndex) {
	pendingSceneIndex = stepIndex;
	if (activeSceneIndex === stepIndex) {
		return;
	}

	activeSceneIndex = stepIndex;
	updateStepState(stepIndex);
	updatePanel(stepIndex);

	if (!primaryMap || !primaryMap.isStyleLoaded()) {
		return;
	}

	if (stepIndex === 3) {
		await activateCompareScene();
		return;
	}

	deactivateCompareScene();
	primaryMap.resize();
	applySceneToMap(primaryMap, scenes[stepIndex]);
}

function updateStepState(stepIndex) {
	for (const stepElement of stepElements) {
		const isActive = Number(stepElement.getAttribute('data-step')) === stepIndex;
		stepElement.classList.toggle('is-active', isActive);
		if (isActive) {
			stepElement.setAttribute('aria-current', 'step');
		} else {
			stepElement.removeAttribute('aria-current');
		}
	}
}

function updatePanel(stepIndex) {
	const scene = scenes[stepIndex];
	panelStep.textContent = String(stepIndex + 1);
	panelTitle.textContent = scene.title;
	panelCopy.textContent = scene.description;
	for (const [index, colour] of scene.legend.entries()) {
		panelElement.style.setProperty(`--legend-${index}`, colour);
	}
}

function createMap(container) {
	const map = new maplibregl.Map({
		attributionControl: false,
		center: germanyCenter,
		container,
		interactive: true,
		renderWorldCopies: false,
		style: baseStyleUrl,
		zoom: defaultZoom,
	});

	configureMapInteractions(map);
	return map;
}

function addRegionsLayers(map) {
	const labelLayerId = map
		.getStyle()
		.layers?.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;

	if (!map.getSource('regions')) {
		map.addSource('regions', {
			type: 'geojson',
			data: regionsData,
		});
	}

	if (!map.getLayer('regions-fill')) {
		map.addLayer({
			id: 'regions-fill',
			type: 'fill',
			source: 'regions',
			paint: {
				'fill-color': scenes[0].fill,
				'fill-color-transition': { duration: 950, delay: 0 },
				'fill-opacity': scenes[0].opacity,
				'fill-opacity-transition': { duration: 950, delay: 0 },
			},
		}, labelLayerId);
	}

	if (!map.getLayer('regions-outline')) {
		map.addLayer({
			id: 'regions-outline',
			type: 'line',
			source: 'regions',
			paint: {
				'line-color': scenes[0].lineColor,
				'line-color-transition': { duration: 950, delay: 0 },
				'line-opacity': 0.78,
				'line-width': 0.8,
			},
		}, labelLayerId);
	}

	attachHoverInteractions(map);
}

function applySceneToMap(map, scene) {
	if (!map.getLayer('regions-fill')) {
		return;
	}

	map.setPaintProperty('regions-fill', 'fill-color', scene.fill);
	map.setPaintProperty('regions-fill', 'fill-opacity', scene.opacity);
	map.setPaintProperty('regions-outline', 'line-color', stepOutlineColour(scene));
	applySceneView(map, scene);
}

function stepOutlineColour(scene) {
	return scene.lineColor ?? outlineFill;
}

function applySceneView(map, scene) {
	if (scene.view?.type === 'fitBounds' && regionsBounds) {
		map.fitBounds(regionsBounds, {
			maxZoom: scene.view.maxZoom,
			padding: scene.view.padding,
			duration: 1800,
			essential: true,
		});
		return;
	}

	map.flyTo({
		center: scene.view?.center ?? germanyCenter,
		zoom: scene.view?.zoom ?? defaultZoom,
		duration: 1800,
		essential: true,
	});
}

async function activateCompareScene() {
	primaryShell.classList.add('is-hidden');
	compareShell.classList.remove('is-hidden');
	compareShell.setAttribute('aria-hidden', 'false');
	await ensureCompareMaps();
	applySceneToMap(compareBeforeMap, scenes[2]);
	applySceneToMap(compareAfterMap, scenes[0]);
	compareBeforeMap.resize();
	compareAfterMap.resize();
	const isEnhanced = await ensureCompareControl();
	compareFallback.hidden = isEnhanced;
	statusElement.hidden = true;
}

function deactivateCompareScene() {
	primaryShell.classList.remove('is-hidden');
	compareShell.classList.add('is-hidden');
	compareShell.setAttribute('aria-hidden', 'true');
	compareFallback.hidden = compareControl !== undefined && compareControl !== null;
	compareBeforeMap?.resize();
	compareAfterMap?.resize();
	statusElement.hidden = true;
}

async function ensureCompareMaps() {
	if (compareBeforeMap && compareAfterMap) {
		return;
	}

	compareBeforeMap = createMap(compareBeforeElement);
	compareAfterMap = createMap(compareAfterElement);
	attachMapErrorHandler(compareBeforeMap);
	attachMapErrorHandler(compareAfterMap);

	await Promise.all([waitForLoad(compareBeforeMap), waitForLoad(compareAfterMap)]);
	addRegionsLayers(compareBeforeMap);
	addRegionsLayers(compareAfterMap);
	applySceneToMap(compareBeforeMap, scenes[2]);
	applySceneToMap(compareAfterMap, scenes[0]);
	comparisonContainer.classList.add('is-static');
	compareFallback.hidden = false;
}

async function ensureCompareControl() {
	if (compareControl) {
		comparisonContainer.classList.remove('is-static');
		return true;
	}

	try {
		const Compare = await loadCompareConstructor();
		if (!Compare) {
			return false;
		}

		compareControl = new Compare(compareBeforeMap, compareAfterMap, comparisonContainer, {
			orientation: 'vertical',
		});
		comparisonContainer.classList.remove('is-static');
		return true;
	} catch (error) {
		console.warn('Compare plugin unavailable, keeping static comparison placeholder.', error);
		return false;
	}
}


async function loadCompareConstructor() {
	if (!compareConstructorPromise) {
		compareConstructorPromise = loadCompareScript(compareBundleUrl).then(() => {
			const Compare = window.maplibregl?.Compare;
			if (!Compare) {
				throw new Error('Compare constructor missing from @maplibre/maplibre-gl-compare');
			}
			return Compare;
		});
	}

	return compareConstructorPromise;
}

function loadCompareScript(source) {
	return new Promise((resolve, reject) => {
		const existing = document.querySelector(`script[src="${source}"]`);
		if (existing) {
			resolve();
			return;
		}

		const script = document.createElement('script');
		script.src = source;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error(`Unable to load ${source}`));
		document.head.append(script);
	});
}

function configureMapInteractions(map) {
	map.boxZoom.disable();
	map.doubleClickZoom.disable();
	map.dragPan.disable();
	map.dragRotate.disable();
	map.keyboard.disable();
	map.scrollZoom.disable();
	map.touchZoomRotate.disable();
}

function attachHoverInteractions(map) {
	if (hoverBoundMaps.has(map)) {
		return;
	}

	hoverBoundMaps.add(map);
	const popup = new maplibregl.Popup({
		className: 'region-popup',
		closeButton: false,
		closeOnClick: false,
		maxWidth: '18rem',
		offset: 16,
	});

	map.on('mouseenter', 'regions-fill', () => {
		map.getCanvas().style.cursor = 'pointer';
	});

	map.on('mousemove', 'regions-fill', (event) => {
		const feature = event.features?.[0];
		if (!feature) {
			return;
		}

		popup
			.setLngLat(event.lngLat)
			.setHTML(renderPopupHtml(feature.properties ?? {}))
			.addTo(map);
	});

	map.on('mouseleave', 'regions-fill', () => {
		map.getCanvas().style.cursor = '';
		popup.remove();
	});
}

function handleResize() {
	primaryMap?.resize();
	compareBeforeMap?.resize();
	compareAfterMap?.resize();
}

function attachMapErrorHandler(map) {
	map.on('error', () => {
		showStatus('Basemap tiles or overlay data are unavailable. The scaffold remains in place while sources are being wired.');
	});
}

function showStatus(message) {
	statusElement.hidden = false;
	statusElement.textContent = message;
}

function waitForLoad(map) {
	if (map.loaded()) {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		map.once('load', () => resolve());
	});
}

async function loadRegions() {
	try {
		const response = await fetch(regionsUrl);
		if (!response.ok) {
			throw new Error(`Unexpected status: ${response.status}`);
		}

		const data = await response.json();
		if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
			throw new Error('GeoJSON placeholder must be a FeatureCollection.');
		}

		prepareRegionsData(data);
		regionsBounds = computeGeoBounds(data);
		return data;
	} catch (error) {
		console.warn('Using empty placeholder regions.', error);
		return { type: 'FeatureCollection', features: [] };
	}
}


function prepareRegionsData(data) {
	for (const feature of data.features) {
		feature.properties ??= {};
		feature.properties.normalized_gap = calculateNormalizedGap(
			feature.properties.nsdap_pct,
			feature.properties.afd_pct,
		);
	}
}

// The outro uses the magnitude of the gap after both election shares are normalised to their scene ranges.
function calculateNormalizedGap(nsdapPct, afdPct) {
	if (typeof nsdapPct !== 'number' || typeof afdPct !== 'number') {
		return null;
	}

	const normalisedHistoric = clamp(nsdapPct / 100, 0, 1);
	const normalisedModern = clamp(afdPct / 30, 0, 1);
	return Math.abs(normalisedHistoric - normalisedModern);
}

function computeGeoBounds(data) {
	if (!data.features.length) {
		return null;
	}

	const [[west, south], [east, north]] = d3.geoBounds(data);
	return [
		[west, south],
		[east, north],
	];
}

function buildChoroplethExpression(property, maxValue) {
	return [
		'case',
		['==', ['get', property], null],
		noDataFill,
		[
			'interpolate',
			['linear'],
			['max', 0, ['min', ['get', property], maxValue]],
			0,
			lightFill,
			maxValue,
			accentFill,
		],
	];
}

function renderPopupHtml(properties) {
	const regionName = typeof properties.GEN === 'string' ? properties.GEN : 'Unknown region';
	return `
		<div class="region-popup__content">
			<p class="region-popup__title">${escapeHtml(regionName)}</p>
			<p class="region-popup__row"><span>NSDAP 1933</span><strong>${formatPercentage(properties.nsdap_pct)}</strong></p>
			<p class="region-popup__row"><span>AfD 2025</span><strong>${formatPercentage(properties.afd_pct)}</strong></p>
		</div>
	`;
}

function formatPercentage(value) {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return 'No data';
	}

	return `${percentFormatter.format(value)}%`;
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}