import * as d3 from 'd3';
import maplibregl from 'maplibre-gl';
import compareBundleUrl from '@maplibre/maplibre-gl-compare/dist/maplibre-gl-compare.js?url';
import regionsUrl from '../data/regions.geojson?url';

const baseStyleUrl = 'https://demotiles.maplibre.org/style.json';
const germanyCenter = [10.4515, 51.1657];

const modernRamp = d3.quantize(
	d3.interpolateRgbBasis(['#170d0f', '#4d1d22', '#80252e', '#b42f3c', '#e63946']),
	5,
);
const archivalRamp = d3.quantize(
	d3.interpolateRgbBasis(['#111111', '#3c2822', '#674034', '#95614c', '#c48760']),
	5,
);
const neutralRamp = d3.quantize(
	d3.interpolateRgbBasis(['#121212', '#232323', '#343434', '#454545', '#585858']),
	5,
);

const scenes = [
	{
		title: 'Germany. Today.',
		description: 'Placeholder contemporary choropleth scaffold tied to the modern timeline.',
		legend: modernRamp,
		fill: buildFillExpression('placeholder_modern', modernRamp),
		opacity: 0.76,
		camera: { center: germanyCenter, zoom: 4.85 },
	},
	{
		title: 'Has it always been like this?',
		description: 'The question scene softens the map and holds the pause before the historical jump.',
		legend: neutralRamp,
		fill: neutralRamp[2],
		opacity: 0.28,
		camera: { center: [10.4515, 51.3], zoom: 4.55 },
	},
	{
		title: 'Germany. 1933.',
		description: 'Placeholder archival shading reserves space for the historical vote-share layer.',
		legend: archivalRamp,
		fill: buildFillExpression('placeholder_historic', archivalRamp),
		opacity: 0.82,
		camera: { center: [10.15, 51.05], zoom: 4.95 },
	},
	{
		title: 'Then and now.',
		description: 'A split placeholder readies the 1933 versus 2025 comparison scene.',
		legend: modernRamp,
		fill: buildFillExpression('placeholder_modern', modernRamp),
		opacity: 0.8,
		camera: { center: germanyCenter, zoom: 4.85 },
	},
	{
		title: "Some things change. Some things don't.",
		description: 'The final scene resolves into a full-country view for the merged regional story.',
		legend: modernRamp,
		fill: modernRamp[4],
		opacity: 0.88,
		camera: { center: germanyCenter, zoom: 4.7 },
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
	return new maplibregl.Map({
		attributionControl: false,
		center: germanyCenter,
		container,
		interactive: false,
		renderWorldCopies: false,
		style: baseStyleUrl,
		zoom: 4.8,
	});
}

function addRegionsLayers(map) {
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
				'fill-color': neutralRamp[2],
				'fill-opacity': 0.3,
			},
		});
	}

	if (!map.getLayer('regions-outline')) {
		map.addLayer({
			id: 'regions-outline',
			type: 'line',
			source: 'regions',
			paint: {
				'line-color': '#181818',
				'line-width': 0.8,
			},
		});
	}
}

function applySceneToMap(map, scene) {
	if (!map.getLayer('regions-fill')) {
		return;
	}

	map.setPaintProperty('regions-fill', 'fill-color', scene.fill);
	map.setPaintProperty('regions-fill', 'fill-opacity', scene.opacity);
	map.setPaintProperty('regions-outline', 'line-color', stepOutlineColour(scene));
	map.flyTo({
		...scene.camera,
		duration: 1800,
		essential: true,
	});
}

function stepOutlineColour(scene) {
	return scene === scenes[2] ? '#241816' : '#181818';
}

async function activateCompareScene() {
	primaryShell.classList.add('is-hidden');
	compareShell.classList.remove('is-hidden');
	compareShell.setAttribute('aria-hidden', 'false');
	await ensureCompareMaps();
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

		return data;
	} catch (error) {
		console.warn('Using empty placeholder regions.', error);
		return { type: 'FeatureCollection', features: [] };
	}
}

function buildFillExpression(property, ramp) {
	return [
		'interpolate',
		['linear'],
		['coalesce', ['get', property], 0],
		0,
		ramp[0],
		0.25,
		ramp[1],
		0.5,
		ramp[2],
		0.75,
		ramp[3],
		1,
		ramp[4],
	];
}