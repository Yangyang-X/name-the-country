import * as THREE from 'three';
import earcut from "https://cdn.jsdelivr.net/npm/earcut@2.2.4/+esm";
import { latLngTo3DPosition } from "../utils/geoUtils.js";

// Constants for default values
const DEFAULT_RADIUS = 100;
const DEFAULT_COLOR = 'red';

var previousGeometries = [];

// Function to convert GeoJSON polygons to 3D meshes using THREE.js and Earcut
function geoJsonTo3DMesh(geoJson, radius = DEFAULT_RADIUS) {
  if (!geoJson || !geoJson.features) {
    console.error("Invalid GeoJSON data:", geoJson);
    return [];
  }

  const meshes = [];

  geoJson.features.forEach((feature, featureIndex) => {
    if (feature.geometry && feature.geometry.coordinates) {
      const coordinates = feature.geometry.coordinates;
      const geometryType = feature.geometry.type;

      let polygons = [];

      if (geometryType === "Polygon") {
        polygons = [coordinates];
      } else if (geometryType === "MultiPolygon") {
        polygons = coordinates;
      } else {
        console.error(`Unsupported geometry type: ${geometryType}`);
        return;
      }

      polygons.forEach((polygon, polyIndex) => {
        // Flatten the polygon data for Earcut
        const data = earcut.flatten(polygon);
        const { vertices, holes, dimensions } = data;

        // Triangulate the polygon using Earcut
        const indices = earcut(vertices, holes, dimensions);

        // Verify the correctness of triangulation
        const deviation = earcut.deviation(vertices, holes, dimensions, indices);
        if (deviation !== 0) {
          console.warn(
            `Triangulation deviation detected at feature index ${featureIndex}, polygon index ${polyIndex}, deviation: ${deviation}`
          );
        }

        // Convert vertices to 3D coordinates on the sphere
        const vertices3D = [];
        for (let i = 0; i < vertices.length; i += dimensions) {
          const lat = vertices[i + 1];
          const lng = vertices[i];
          const [x, y, z] = latLngTo3DPosition(lat, lng, radius);
          vertices3D.push(x, y, z);
        }

        // Create the geometry and set the vertices
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices3D, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshBasicMaterial({
          color: DEFAULT_COLOR,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        previousGeometries.push(mesh.uuid);
        meshes.push(mesh);
      });
    } else {
      console.error(`Feature does not have a valid geometry:`, feature);
    }
  });

  return meshes;
}

// Function to convert GeoJSON polygons to 3D lines using THREE.js
function geoJsonTo3DLines(geoJson, radius = DEFAULT_RADIUS) {
  if (!geoJson || !geoJson.features) {
    console.error("Invalid GeoJSON data:", geoJson);
    return [];
  }

  const lines = [];

  geoJson.features.forEach((feature, featureIndex) => {
    if (feature.geometry && feature.geometry.coordinates) {
      feature.geometry.coordinates.forEach((polygon, polyIndex) => {
        polygon.forEach((ring, ringIndex) => {
          const vertices3D = [];
          ring.forEach(([lng, lat]) => {
            const [x, y, z] = latLngTo3DPosition(lat, lng, radius);
            vertices3D.push(x, y, z);
          });

          // Ensure the polygon is closed
          const firstPoint = vertices3D.slice(0, 3);
          vertices3D.push(...firstPoint);

          // Create geometry for the line
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices3D, 3));

          const material = new THREE.LineBasicMaterial({ color: DEFAULT_COLOR });
          const line = new THREE.LineLoop(geometry, material);

          previousGeometries.push(line.uuid);
          lines.push(line);
        });
      });
    } else {
      console.error(`Feature does not have a valid geometry:`, feature);
    }
  });

  return lines;
}

// Function to convert GeoJSON polygons to a single 3D pin using THREE.js
function geoJsonToSingle3DPin(geoJson, radius = DEFAULT_RADIUS) {
  if (!geoJson || !geoJson.features) {
    console.error("Invalid GeoJSON data:", geoJson);
    return [];
  }

  const pins = [];
  const firstFeature = geoJson.features[0];

  if (firstFeature && firstFeature.geometry && firstFeature.geometry.coordinates) {
    // Take the first polygon of the first feature
    const firstPolygon = firstFeature.geometry.coordinates[0];

    // Calculate the centroid of the polygon
    let totalLng = 0;
    let totalLat = 0;
    let count = 0;

    firstPolygon.forEach((ring) => {
      ring.forEach(([lng, lat]) => {
        totalLng += lng;
        totalLat += lat;
        count++;
      });
    });

    const centroidLng = totalLng / count;
    const centroidLat = totalLat / count;

    const [x, y, z] = latLngTo3DPosition(centroidLat, centroidLng, radius);

    // Create a custom pin
    const pin = createClassicPin(DEFAULT_COLOR);

    // Set the position of the pin
    pin.position.set(x, y, z);

    // Calculate the normal vector and align the pin outward
    const normal = new THREE.Vector3(x, y, z).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    // Create a quaternion to align the pin with the normal vector
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal);
    pin.setRotationFromQuaternion(quaternion);

    previousGeometries.push(pin.uuid);
    pins.push(pin);
  } else {
    console.error(`First feature does not have a valid geometry:`, firstFeature);
  }

  return pins;
}

// Function to create a classic pin
function createClassicPin(color) {
  // Create a group for the pin
  const pinGroup = new THREE.Group();

  // Scale factors based on globe radius
  const stickHeight = 4; // Height of the stick (in units)
  const stickGeometry = new THREE.CylinderGeometry(0.1, 0.1, stickHeight, 16);
  const stickMaterial = new THREE.MeshBasicMaterial({ color });
  const stick = new THREE.Mesh(stickGeometry, stickMaterial);

  // Create the ball
  const ballRadius = 1.5; // Radius of the ball (in units)
  const ballGeometry = new THREE.SphereGeometry(ballRadius, 16, 16);
  const ballMaterial = new THREE.MeshBasicMaterial({ color });
  const ball = new THREE.Mesh(ballGeometry, ballMaterial);

  // Create the base
  const baseRadius = 0.5; // Radius of the base (in units)
  const baseHeight = 0.2; // Height of the base (in units)
  const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius, baseHeight, 16);
  const baseMaterial = new THREE.MeshBasicMaterial({ color });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);

  // Position the components along the Z-axis
  stick.position.set(0, stickHeight / 2, 0);
  ball.position.set(0, stickHeight + ballRadius, 0);
  base.position.set(0, -baseHeight / 2, 0);

  // Add components to the group
  pinGroup.add(stick);
  pinGroup.add(ball);
  pinGroup.add(base);

  return pinGroup;
}

// Function to remove previous geometries
function removePreviousGeometries(earth) {
  if (previousGeometries.length > 0) {
    previousGeometries.forEach((geometryId) => {
      const previousGeometry = earth.getObjectByProperty("uuid", geometryId);
      if (previousGeometry) {
        earth.remove(previousGeometry);
      }
    });
    previousGeometries.length = 0;
  }
}

// Function to highlight a region with different styles
function highlightPolygons(geoJson, earth, radius = DEFAULT_RADIUS, style = "mesh", elevation = 1.0) {
  // Resize the Earth to the initial radius if zoomed
  earth.scale.set(1, 1, 1);

  // Highlight new polygons after a delay
  let polygonMeshes = [];

  if (style === "mesh") {
    polygonMeshes = geoJsonTo3DMesh(geoJson, radius * elevation);
  } else if (style === "lines") {
    polygonMeshes = geoJsonTo3DLines(geoJson, radius * elevation);
  } else if (style === "pin") {
    polygonMeshes = geoJsonToSingle3DPin(geoJson, radius * elevation);
  }

  // Add polygon meshes to the Earth
  polygonMeshes.forEach((geometry) => {
    earth.add(geometry);
  });

}

export { highlightPolygons, removePreviousGeometries };
