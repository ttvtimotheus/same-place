import * as d3 from 'd3';
import scrollama from 'scrollama';
import maplibregl from 'maplibre-gl';
import compareBundleUrl from '@maplibre/maplibre-gl-compare/dist/maplibre-gl-compare.js?url';
import regionsUrl from '../data/regions.geojson?url';

const baseStyleUrl = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const germanyCenter = [10.4515, 51.5];
const defaultZoom = 6;
const missingFill = '#1a1a1a';
const lightFill = '#f7f7f7';
const accentFill = '#e63946';
const outlineFill = '#181818';
const keptBasemapLabelLayerIds = new Set([
	'place_country_1',
	'place_country_2',
	'place_city_dot_r2',
	'place_city_dot_r4',
	'place_capital_dot_z7',
]);
const hoverBoundMaps = new WeakSet();
const percentFormatter = new Intl.NumberFormat('en-GB', {
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
});

const scenes = [
	{
		titleLines: ['Germany. Today.'],
		body: 'AfD vote share by district, federal election 2025.',
		layout: 'corner',
		showLegend: true,
		fill: buildChoroplethExpression('afd_pct', 30),
		opacity: 0.94,
		lineColor: outlineFill,
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
	},
	{
		titleLines: ['Has it always been like this?'],
		layout: 'center',
		overlayDelay: 500,
		showLegend: false,
		fill: buildChoroplethExpression('afd_pct', 30),
		opacity: 0.94,
		lineColor: outlineFill,
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
	},
	{
		titleLines: ['Germany. 1933.'],
		body: 'NSDAP vote share by district, March election 1933.\nGrey districts have no comparable historical boundary.',
		layout: 'corner',
		showLegend: true,
		fill: buildChoroplethExpression('nsdap_pct', 100, missingFill),
		opacity: 0.94,
		lineColor: '#241816',
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
	},
	{
		titleLines: ['Then and now.'],
		body: 'Drag to compare.',
		layout: 'corner',
		showLegend: true,
		fill: buildChoroplethExpression('afd_pct', 30),
		opacity: 0.94,
		lineColor: outlineFill,
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
	},
	{
		titleLines: ['Some things change.', "Some things don't."],
		layout: 'center-split',
		showLegend: false,
		fill: buildChoroplethExpression('correlation_score', 1),
		opacity: 0.94,
		lineColor: outlineFill,
		view: { type: 'flyTo', center: germanyCenter, zoom: defaultZoom },
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
const storyElement = document.querySelector('[data-story]');
const sceneOverlayElement = document.querySelector('[data-scene-overlay]');
const sceneTitleLineOne = document.querySelector('[data-scene-title-line-1]');
const sceneTitleLineTwo = document.querySelector('[data-scene-title-line-2]');
const sceneBody = document.querySelector('[data-scene-body]');
const sceneLegend = document.querySelector('[data-scene-legend]');
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
let scroller;
let storyRevealObserver;
let storyStarted = false;
let sceneOverlayTimeout;

if (
	primaryShell &&
	primaryMapElement &&
	compareShell &&
	comparisonContainer &&
	compareBeforeElement &&
	compareAfterElement &&
	compareFallback &&
	statusElement &&
	storyElement &&
	sceneOverlayElement &&
	sceneTitleLineOne &&
	sceneTitleLineTwo &&
	sceneBody &&
	sceneLegend &&
	stepElements.length
) {
	window.maplibregl = maplibregl;
	void initialiseStory();
}

async function initialiseStory() {
	regionsData = await loadRegions();
	primaryMap = createMap(primaryMapElement);
	primaryMap.on('load', () => {
		addRegionsLayers(primaryMap);
		if (activeSceneIndex === 3) {
			void activateCompareScene();
			return;
		}

		applySceneToMap(primaryMap, scenes[activeSceneIndex === -1 ? 0 : activeSceneIndex]);
	});
	attachMapErrorHandler(primaryMap);
	initialiseScroller();
	initialiseStoryReveal();
	window.addEventListener('resize', handleResize, { passive: true });
}

function initialiseScroller() {
	scroller?.destroy();
	scroller = scrollama();
	scroller
		.setup({
			step: stepElements,
			offset: 0.5,
		})
		.onStepEnter(({ element }) => {
			const stepIndex = Number(element.getAttribute('data-step'));
			void updateMap(stepIndex);
		});
}

function initialiseStoryReveal() {
	storyRevealObserver?.disconnect();
	storyRevealObserver = new IntersectionObserver(
		(entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) {
				return;
			}

			revealStory();
			void updateMap(resolveActiveStepIndex());
			storyRevealObserver?.disconnect();
		},
		{ threshold: 0.12 },
	);

	storyRevealObserver.observe(storyElement);
}

function revealStory() {
	if (storyStarted) {
		return;
	}

	storyStarted = true;
	document.documentElement.classList.add('is-story-started');
}

function resolveActiveStepIndex() {
	const triggerLine = window.innerHeight * 0.5;
	let nearestStep = stepElements[0];
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const stepElement of stepElements) {
		const rect = stepElement.getBoundingClientRect();
		const midpoint = rect.top + rect.height * 0.5;
		const distance = Math.abs(midpoint - triggerLine);

		if (rect.top <= triggerLine && rect.bottom >= triggerLine) {
			return Number(stepElement.getAttribute('data-step'));
		}

		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestStep = stepElement;
		}
	}

	return Number(nearestStep.getAttribute('data-step'));
}

async function updateMap(stepIndex) {
	pendingSceneIndex = stepIndex;
	revealStory();

	if (activeSceneIndex === stepIndex) {
		return;
	}

	activeSceneIndex = stepIndex;
	updateStepState(stepIndex);
	updateSceneOverlay(stepIndex);
	updateSceneLegend(stepIndex);

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

function updateSceneOverlay(stepIndex) {
	const scene = scenes[stepIndex];
	const hasVisibleOverlay =
		!sceneOverlayElement.hidden && sceneOverlayElement.classList.contains('is-visible');

	sceneOverlayElement.classList.remove('is-visible');
	window.clearTimeout(sceneOverlayTimeout);

	const fadeOutDuration = hasVisibleOverlay ? 400 : 0;
	const sceneDelay = scene.overlayDelay ?? 0;

	sceneOverlayTimeout = window.setTimeout(() => {
		renderSceneOverlay(scene);
		sceneOverlayElement.hidden = false;
		requestAnimationFrame(() => {
			sceneOverlayElement.classList.add('is-visible');
		});
	}, fadeOutDuration + sceneDelay);
}

function renderSceneOverlay(scene) {
	sceneOverlayElement.dataset.layout = scene.layout ?? 'corner';
	sceneTitleLineOne.textContent = scene.titleLines?.[0] ?? '';

	if (scene.titleLines?.[1]) {
		sceneTitleLineTwo.textContent = scene.titleLines[1];
		sceneTitleLineTwo.hidden = false;
	} else {
		sceneTitleLineTwo.hidden = true;
		sceneTitleLineTwo.textContent = '';
	}

	if (scene.body) {
		sceneBody.hidden = false;
		sceneBody.textContent = scene.body;
	} else {
		sceneBody.hidden = true;
		sceneBody.textContent = '';
	}
}

function updateSceneLegend(stepIndex) {
	const shouldShowLegend = storyStarted && Boolean(scenes[stepIndex]?.showLegend);
	sceneLegend.classList.remove('is-visible');

	if (!shouldShowLegend) {
		sceneLegend.hidden = true;
		return;
	}

	sceneLegend.hidden = false;
	requestAnimationFrame(() => {
		sceneLegend.classList.add('is-visible');
	});
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

	map.on('load', () => {
		configureBasemapLabels(map);
	});
	configureMapInteractions(map);
	return map;
}

function configureBasemapLabels(map) {
	for (const layer of map.getStyle().layers ?? []) {
		if (layer.type !== 'symbol') {
			continue;
		}

		if (!keptBasemapLabelLayerIds.has(layer.id)) {
			map.setLayoutProperty(layer.id, 'visibility', 'none');
			continue;
		}

		const isCountryLabel = layer.id.startsWith('place_country');
		map.setPaintProperty(layer.id, 'text-color', isCountryLabel ? '#f4f6f8' : '#d8dde3');
		map.setPaintProperty(layer.id, 'text-halo-color', '#0e0e0e');
		map.setPaintProperty(layer.id, 'text-halo-width', 1);
	}
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
		map.addLayer(
			{
				id: 'regions-fill',
				type: 'fill',
				source: 'regions',
				paint: {
					'fill-color': scenes[0].fill,
					'fill-color-transition': { duration: 950, delay: 0 },
					'fill-opacity': scenes[0].opacity,
					'fill-opacity-transition': { duration: 950, delay: 0 },
				},
			},
			labelLayerId,
		);
	}

	if (!map.getLayer('regions-outline')) {
		map.addLayer(
			{
				id: 'regions-outline',
				type: 'line',
				source: 'regions',
				paint: {
					'line-color': scenes[0].lineColor,
					'line-color-transition': { duration: 950, delay: 0 },
					'line-opacity': 0.78,
					'line-width': 0.8,
				},
			},
			labelLayerId,
		);
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
	applySceneToMap(compareBeforeMap, scenes[0]);
	applySceneToMap(compareAfterMap, scenes[2]);
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
	compareFallback.hidden = true;
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
	applySceneToMap(compareBeforeMap, scenes[0]);
	applySceneToMap(compareAfterMap, scenes[2]);
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
	scroller?.resize();
}

function attachMapErrorHandler(map) {
	map.on('error', () => {
		showStatus('Basemap or overlay data unavailable.');
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
		feature.properties.correlation_score = calculateCorrelationScore(
			feature.properties.nsdap_pct,
			feature.properties.afd_pct,
		);
	}
}

function calculateCorrelationScore(nsdapPct, afdPct) {
	const normalisedHistoric =
		typeof nsdapPct === 'number' ? clamp(nsdapPct / 100, 0, 1) : null;
	const normalisedModern =
		typeof afdPct === 'number' ? clamp(afdPct / 30, 0, 1) : null;

	if (normalisedHistoric !== null && normalisedModern !== null) {
		return (normalisedHistoric + normalisedModern) / 2;
	}

	if (normalisedHistoric !== null) {
		return normalisedHistoric;
	}

	if (normalisedModern !== null) {
		return normalisedModern;
	}

	return null;
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

function buildChoroplethExpression(property, maxValue, missingColour = missingFill) {
	return [
		'case',
		['==', ['get', property], null],
		missingColour,
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