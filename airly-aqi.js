// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: cloud;

/**
 * Widget from https://github.com/jsynowiec/airly-aqi-scriptable-widget
 * By Jakub Synowiec
 * Distributed under the GPL-3.0 license
 */

// Get your API key here: https://developer.airly.org/en/docs#general.authentication
const AIRLY_API_KEY = "";

/**
 * Find a nearby Airly installation ID via https://airly.org/map
 * Click a installation near your location: the ID is the last number in the URL after the letter "i"
 * For example, in the https://airly.org/map/en/#52.203759,21.048137,i8892 URL, the ID is 8892
 */
const AIRLY_INSTALLATION_ID = args.widgetParameter;

// Type of the index which should be calculated and returned in response;
// Currently supported values are AIRLY_CAQI (default), CAQI, and PIJP;
const AIRLY_INDEX = "AIRLY_CAQI";

// The measurements station must be located within this limit from the given point (in km)
const AIRLY_MAX_DISTANCE = 5; // in KM

// How long to cache the location data.
const CACHE_MS = 30 * 60 * 1000;

const TEXT_COLOR = Color.white();

// Errors

class NoDataError extends Error {
  constructor(message = "") {
    super(message);
    this.name = "NoDataError";
  }
}

class StationNotFoundError extends Error {
  constructor(message = "") {
    super(message);
    this.name = "StationNotFoundError";
  }
}

class ConfigError extends Error {
  constructor(message = "") {
    super(message);
    this.name = "ConfigError";
  }
}

// Widget helpers

function createWidget(location, data, { temperature, pressure, humidity }) {
  const listWidget = new ListWidget();
  listWidget.useDefaultPadding();

  const gradient = new LinearGradient();
  gradient.locations = [0, 1];
  gradient.colors = [new Color("141414"), new Color("13233F")];
  listWidget.backgroundGradient = gradient;

  const titleStack = listWidget.addStack();
  titleStack.centerAlignContent();

  const titleElement = titleStack.addText(location);
  titleElement.textColor = TEXT_COLOR;
  titleElement.textOpacity = 0.8;
  titleElement.font = Font.mediumSystemFont(13);

  titleStack.addSpacer(4);

  const locationSymbol = SFSymbol.named(
    AIRLY_INSTALLATION_ID ? "mappin.and.ellipse" : "location.fill"
  );
  const appIconElement = titleStack.addImage(locationSymbol.image);
  appIconElement.imageSize = new Size(12, 12);
  appIconElement.tintColor = TEXT_COLOR;
  appIconElement.imageOpacity = 0.8;

  listWidget.addSpacer();

  const nameStack = listWidget.addStack();
  const AQISymbolName = "aqi.medium";
  if (data.value > 90) {
    AQISymbolName = "aqi.high";
  }
  const AQISymbol = SFSymbol.named(AQISymbolName);
  const AQIIconElement = nameStack.addImage(AQISymbol.image);
  AQIIconElement.imageSize = new Size(20, 20);
  AQIIconElement.tintColor = new Color(data.color.substring(1));

  nameStack.addSpacer(4);

  const nameElement = nameStack.addText(Math.round(data.value).toString());
  nameElement.textColor = TEXT_COLOR;
  nameElement.font = Font.boldSystemFont(18);

  listWidget.addSpacer(4);

  const descriptionElement = listWidget.addText(data.description);
  descriptionElement.minimumScaleFactor = 0.5;
  descriptionElement.textColor = TEXT_COLOR;
  descriptionElement.font = Font.systemFont(18);

  listWidget.addSpacer();

  const footerStack = listWidget.addStack();
  footerStack.centerAlignContent();

  let values = [];

  if (temperature) {
    values = [...values, ["thermometer", `${temperature.toFixed(1)}℃`]];
  }

  if (
    (config.runsInWidget && config.widgetFamily != "small") ||
    !config.runsInWidget
  ) {
    if (pressure) {
      values = [...values, ["barometer", `${pressure.toFixed(0)} hPa`]];
    }

    if (humidity) {
      values = [...values, ["humidity", `${humidity.toFixed(0)} %`]];
    }
  }

  values.forEach(([symbolName, value]) =>
    addMeasurementElement(footerStack, symbolName, value)
  );

  return listWidget;
}

function addMeasurementElement(stack, symbolName, text) {
  const symbol = SFSymbol.named(symbolName);
  const symbolElement = stack.addImage(symbol.image);
  symbolElement.imageSize = new Size(11, 11);
  symbolElement.tintColor = TEXT_COLOR;
  symbolElement.imageOpacity = 0.8;

  stack.addSpacer(4);

  const valueElement = stack.addText(text);
  valueElement.font = Font.mediumSystemFont(11);
  valueElement.textColor = TEXT_COLOR;
  valueElement.textOpacity = 0.8;

  stack.addSpacer(4);
}

function createErrorWidget(err) {
  const listWidget = new ListWidget();
  listWidget.useDefaultPadding();

  const stack = listWidget.addStack();
  stack.topAlignContent();

  const symbol = SFSymbol.named("exclamationmark.circle");
  const symbolElement = stack.addImage(symbol.image);
  symbolElement.imageSize = new Size(13, 13);
  symbolElement.tintColor = Color.red();

  stack.addSpacer(4);

  const errorText = stack.addText(err.message);
  errorText.textColor = Color.red();
  errorText.font = Font.mediumSystemFont(13);

  return listWidget;
}

// Airly AQI Data

async function callAirlyAPI(url) {
  const req = new Request(url);
  req.headers = {
    accept: "application/json",
    "accept-language": "en",
    apikey: AIRLY_API_KEY,
  };
  return await req.loadJSON();
}

function parseAirlyMeasurementsData(aqiData) {
  const {
    current: { values, indexes: measurements },
  } = aqiData;

  const airQuality = measurements[0];

  const READING_NAMES = ["temperature", "pressure", "humidity"];
  const readings = values.reduce((acc, el) => {
    if (READING_NAMES.includes(el.name.toLowerCase())) {
      return {
        ...acc,
        [el.name.toLowerCase()]: el.value,
      };
    }

    return acc;
  }, {});

  return {
    airQuality,
    readings,
  };
}

async function getNearestAQIData(lat, lng) {
  // Measurements for an installation closest to a given location.
  const AIRLY_URL = "https://airapi.airly.eu/v2/measurements/nearest";

  const url = `${AIRLY_URL}?indexType=${AIRLY_INDEX}&lat=${lat}&lng=${lng}&maxDistanceKM=${AIRLY_MAX_DISTANCE}`;
  const data = await callAirlyAPI(url);

  if (data.errorCode) {
    console.log(data);
    const message =
      data.details && data.details.message
        ? data.details.message
        : data.message;
    throw new NoDataError(message);
  }

  return parseAirlyMeasurementsData(data);
}

async function getStationAQIData(stationID) {
  const AIRLY_METADATA_URL = "https://airapi.airly.eu/v2/installations";
  const metadata_url = `${AIRLY_METADATA_URL}/${stationID}`;
  const metadata = await callAirlyAPI(metadata_url);

  if (metadata.errorCode) {
    console.log(metadata);
    throw new StationNotFoundError(metadata.message);
  }

  const AIRLY_MEASUREMENTS_URL =
    "https://airapi.airly.eu/v2/measurements/installation";
  const measurements_url = `${AIRLY_MEASUREMENTS_URL}?indexType=${AIRLY_INDEX}&installationId=${stationID}`;
  const aqiData = await callAirlyAPI(measurements_url);

  if (aqiData.errorCode) {
    console.log(aqiData);
    throw new NoDataError(aqiData.message);
  }

  return {
    locality: metadata.address.city,
    ...parseAirlyMeasurementsData(aqiData),
  };
}

// Cache management

function getCache(fileName) {
  const fileManager = FileManager.local();
  const cacheDirectory = fileManager.joinPath(
    fileManager.libraryDirectory(),
    "airly-aqi"
  );
  const cacheFile = fileManager.joinPath(cacheDirectory, fileName);

  if (!fileManager.fileExists(cacheDirectory)) {
    fileManager.createDirectory(cacheDirectory);
  }

  return { fileManager, cacheDirectory, cacheFile };
}

function getCachedData(fileName) {
  const { fileManager, cacheFile } = getCache(fileName);

  if (!fileManager.fileExists(cacheFile)) {
    return [undefined, undefined];
  }

  const contents = fileManager.readString(cacheFile);
  return [JSON.parse(contents), fileManager.modificationDate(cacheFile)];
}

function cacheData(fileName, data) {
  const { fileManager, cacheFile } = getCache(fileName);

  const contents = JSON.stringify(data);
  fileManager.writeString(cacheFile, contents);
}

// Geolocation

async function getLocation() {
  const [cachedLocation, modificationDate] = getCachedData("location.json");

  // Use cached data if cache exists and it has been less than 30 minutes since last request.
  if (cachedLocation && Date.now() - modificationDate.getTime() < CACHE_MS) {
    console.log(`Cache hit: ${JSON.stringify(cachedLocation)}`);
    return cachedLocation;
  }

  console.log("Cache miss");

  Location.setAccuracyToHundredMeters();
  let { latitude, longitude } = await Location.current();
  let revGeo = await Location.reverseGeocode(latitude, longitude);
  let { locality } = revGeo[0];

  cacheData("location.json", {
    latitude,
    longitude,
    locality,
  });

  return { latitude, longitude, locality };
}

// ---
// Script start

let widget;

try {
  if (!AIRLY_API_KEY) {
    throw ConfigError("You must set the Airly API key");
  }

  if (AIRLY_INSTALLATION_ID) {
    console.log(`Using installation ID ${AIRLY_INSTALLATION_ID}`);
    const { airQuality, readings, locality } = await getStationAQIData(
      AIRLY_INSTALLATION_ID
    );
    widget = createWidget(locality, airQuality, readings);
  } else {
    const { latitude, longitude, locality } = await getLocation();
    const { airQuality, readings } = await getNearestAQIData(
      latitude,
      longitude
    );
    widget = createWidget(locality, airQuality, readings);
  }
} catch (err) {
  console.error(err);

  if (err instanceof StationNotFoundError) {
    widget = createErrorWidget(err);
  } else if (err instanceof NoDataError) {
    widget = createErrorWidget(err);
  } else if (err instanceof ConfigError) {
    widget = createErrorWidget(err);
  } else {
    throw err;
  }
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}

if (config.runsWithSiri) {
  Speech.speak(airQuality.advice);
}

Script.complete();
