import { useMemo, useRef, useState } from 'react';
import { Canvas, Circle, Rect, useCanvasRef } from '@shopify/react-native-skia';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Linking,
} from 'react-native';
import { ImageFormat } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { clampNode, clampZoom, cloneScene, hitTest, screenToWorld, type SceneNode, viewportOrigin, viewportScale, worldToScreen, WORLD } from './scene';
import { hasPngSignature } from './png';

type Point = { x: number; y: number };
type GestureState = { start: Point; nodeStart: Point | null; pinchDistance: number | null; zoom: number; pan: Point };

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export default function PrototypeScreen() {
  const { width, height } = useWindowDimensions();
  const landscape = width >= height;
  const canvasWidth = landscape ? Math.max(320, width * 0.68) : width - 24;
  const canvasHeight = landscape ? Math.max(300, height - 128) : Math.max(300, height * 0.52);
  const [nodes, setNodes] = useState<SceneNode[]>(cloneScene);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [exportState, setExportState] = useState<'idle' | 'working' | 'shared' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState('');
  const canvasRef = useCanvasRef();
  const gesture = useRef<GestureState | null>(null);
  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  // World coordinates remain stable. Only this projection changes with the
  // tablet size, zoom and pan, so rotation does not rewrite scene geometry.
  const viewport = useMemo(() => ({ width: canvasWidth, height: canvasHeight, zoom, panX: pan.x, panY: pan.y }), [canvasHeight, canvasWidth, pan, zoom]);
  const scale = viewportScale(viewport);
  const origin = viewportOrigin(viewport);
  const toWorld = (point: Point): Point => screenToWorld(point, viewport);
  const toScreen = (point: Point): Point => worldToScreen(point, viewport);

  const reset = () => {
    setNodes(cloneScene());
    setSelectedId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setExportState('idle');
    setExportMessage('');
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches;
      const first = touches[0];
      if (!first) return;
      const start = { x: first.locationX, y: first.locationY };
      const second = touches[1];
      const world = toWorld(start);
      const node = second ? null : hitTest(nodes, world.x, world.y);
      if (node) setSelectedId(node.id);
      gesture.current = {
        start,
        nodeStart: node ? { x: node.x, y: node.y } : null,
        pinchDistance: second ? distance(start, { x: second.locationX, y: second.locationY }) : null,
        zoom,
        pan,
      };
    },
    onPanResponderMove: (event) => {
      const current = gesture.current;
      const touches = event.nativeEvent.touches;
      const first = touches[0];
      if (!current || !first) return;
      const point = { x: first.locationX, y: first.locationY };
      const second = touches[1];
      if (second && current.pinchDistance) {
        const nextDistance = distance(point, { x: second.locationX, y: second.locationY });
        setZoom(clampZoom(current.zoom * nextDistance / current.pinchDistance));
        setPan({ x: current.pan.x + (point.x - current.start.x), y: current.pan.y + (point.y - current.start.y) });
        return;
      }
      if (second && !current.pinchDistance) {
        // A second finger arriving during a drag promotes the gesture to
        // viewport mode. It must never continue moving the selected node.
        current.nodeStart = null;
        current.pinchDistance = distance(point, { x: second.locationX, y: second.locationY });
        current.start = point;
        current.pan = pan;
        return;
      }
      const dx = point.x - current.start.x;
      const dy = point.y - current.start.y;
      if (current.nodeStart && selectedId) {
        const node = nodes.find((item) => item.id === selectedId);
        if (!node) return;
        const next = clampNode(node, current.nodeStart.x + dx / scale, current.nodeStart.y + dy / scale);
        setNodes((items) => items.map((item) => item.id === selectedId ? { ...item, ...next } : item));
      } else {
        setPan({ x: current.pan.x + dx, y: current.pan.y + dy });
      }
    },
    onPanResponderRelease: () => { gesture.current = null; },
    onPanResponderTerminate: () => { gesture.current = null; },
  }), [nodes, pan, scale, selectedId, zoom]);

  const exportPng = async () => {
    setExportState('working');
    setExportMessage('');
    let file: File | null = null;
    try {
      const image = canvasRef.current?.makeImageSnapshot();
      if (!image) throw new Error('Skia no devolvió una imagen.');
      const bytes = image.encodeToBytes(ImageFormat.PNG, 100);
      if (!hasPngSignature(bytes) || bytes.length < PNG_MIN_BYTES) {
        throw new Error('La captura no produjo un PNG válido.');
      }
      file = new File(Paths.cache, `marimba-prototype-${Date.now()}.png`);
      await file.write(bytes);
      if (!file.exists || file.size <= 0) throw new Error('No se pudo verificar el archivo temporal.');
      if (!(await Sharing.isAvailableAsync())) {
        setExportState('error');
        setExportMessage(`PNG guardado temporalmente en cache, pero compartir no está disponible (${file.uri}).`);
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'image/png', dialogTitle: 'Compartir distribución PNG' });
      // The cache directory is intentionally not deleted immediately: the
      // share sheet may hand the URI to another app after this promise resolves.
      // The OS owns cache eviction; no image URI is retained in React state.
      setExportState('shared');
      setExportMessage('PNG válido escrito en cache y entregado al compartir nativo.');
    } catch (error) {
      setExportState('error');
      setExportMessage(error instanceof Error ? error.message : 'La exportación fue cancelada o falló.');
    }
  };

  const openWebApp = () => {
    const url = process.env.EXPO_PUBLIC_WEB_URL;
    if (url) void Linking.openURL(url);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>FASE 15 · PROTOTIPO AISLADO</Text>
          <Text style={styles.title}>Editor de distribución</Text>
        </View>
        <Text style={styles.orientation}>{landscape ? 'Paisaje' : 'Retrato'} · {Math.round(width)}×{Math.round(height)}</Text>
      </View>
      <View style={[styles.workspace, landscape ? styles.workspaceLandscape : styles.workspacePortrait]}>
        <View style={[styles.canvasFrame, { width: canvasWidth, height: canvasHeight }]} {...panResponder.panHandlers}>
          <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} opaque>
            <Rect x={0} y={0} width={canvasWidth} height={canvasHeight} color="#f3f6f4" />
            {nodes.map((node) => {
              const p = toScreen(node);
              const selectedNode = node.id === selectedId;
              return node.kind === 'marimba' ? (
                <Rect key={node.id} x={p.x} y={p.y} width={node.width * scale} height={node.height * scale} color={selectedNode ? '#235878' : node.color} style="fill" />
              ) : (
                <Rect key={node.id} x={p.x} y={p.y} width={node.width * scale} height={node.height * scale} color={selectedNode ? '#f59e0b' : node.color} style="fill" />
              );
            })}
            {nodes.filter((node) => node.kind === 'person').map((node) => {
              const p = toScreen({ x: node.x + node.width - 10, y: node.y + 10 });
              return <Circle key={`${node.id}-dot`} cx={p.x} cy={p.y} r={4 * Math.max(1, scale)} color="#dbeafe" />;
            })}
          </Canvas>
          {nodes.map((node) => {
            const p = toScreen({ x: node.x, y: node.y });
            return <Text key={`${node.id}-label`} numberOfLines={1} style={[styles.nodeLabel, { left: p.x + 8, top: p.y + 8, width: node.width * scale - 16 }, node.kind === 'marimba' && styles.marimbaLabel]}>{node.label}</Text>;
          })}
          <Text style={styles.gestureHint}>Toque: seleccionar · arrastre: mover/pan · dos dedos: zoom + pan</Text>
        </View>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Propiedades</Text>
          <Text style={styles.panelText}>{selected ? `${selected.kind === 'person' ? 'Persona' : 'Marimba'}: ${selected.label}` : 'Ningún elemento seleccionado'}</Text>
          <Text style={styles.panelText}>Zoom: {Math.round(zoom * 100)}%</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => setZoom((value) => clampZoom(value / 1.2))}><Text style={styles.buttonText}>− Zoom</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => setZoom((value) => clampZoom(value * 1.2))}><Text style={styles.buttonText}>+ Zoom</Text></Pressable>
          </View>
          <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={reset}><Text style={styles.buttonText}>Restablecer escena</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.button} onPress={exportPng}><Text style={styles.darkText}>Capturar PNG</Text></Pressable>
          {process.env.EXPO_PUBLIC_WEB_URL && <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={openWebApp}><Text style={styles.buttonText}>Abrir aplicación completa</Text></Pressable>}
          <Text style={styles.note}>Fixture local ficticio. No hay backend, login ni persistencia en este prototipo.</Text>
          {exportState !== 'idle' && <Text style={exportState === 'shared' ? styles.success : styles.error}>{exportMessage}</Text>}
        </View>
      </View>
      {exportState === 'shared' && <View accessibilityRole="image" accessibilityLabel="Estado de exportación PNG" style={styles.preview}><Text style={styles.success}>Exportación completada.</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1220', padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#93c5fd', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  orientation: { color: '#cbd5e1', fontSize: 12 },
  workspace: { gap: 12, alignItems: 'stretch' },
  workspaceLandscape: { flex: 1, flexDirection: 'row' },
  workspacePortrait: { flex: 1, flexDirection: 'column' },
  canvasFrame: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#f3f6f4', borderWidth: 1, borderColor: '#334155' },
  nodeLabel: { position: 'absolute', color: '#fff', fontSize: 11, fontWeight: '700' },
  marimbaLabel: { fontSize: 16, top: 12 },
  gestureHint: { position: 'absolute', bottom: 8, left: 12, color: '#334155', fontSize: 11 },
  panel: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10, minWidth: 230, flex: 1 },
  panelTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  panelText: { color: '#334155', fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 9, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  primaryButton: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 9, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  darkText: { color: '#0f172a', fontWeight: '700' },
  note: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  success: { color: '#166534', fontSize: 12, lineHeight: 17 },
  error: { color: '#b91c1c', fontSize: 12, lineHeight: 17 },
  preview: { backgroundColor: '#dcfce7', padding: 10, borderRadius: 8 },
});

const PNG_MIN_BYTES = 24;
