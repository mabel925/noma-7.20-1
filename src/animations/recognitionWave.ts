// The approved preview: one curved wave, a short rest, then another sweep.
export const RECOGNITION_WAVE_SETTINGS = Object.freeze({
  amplitude: 14,
  sweepDuration: 3600,
  visibleSweepRatio: 0.84,
  pauseDuration: 100,
  finishDuration: 180,
  spacing: 240,
  glow: 0.2,
});

export function getRecognitionWaveFrame(elapsed: number, width: number, height: number) {
  const s = RECOGNITION_WAVE_SETTINGS;
  const visibleDuration = s.sweepDuration * s.visibleSweepRatio;
  const localTime = Math.max(0, elapsed) % (visibleDuration + s.pauseDuration);
  const progress = Math.min(localTime / s.sweepDuration, 1);
  const settle = Math.min(Math.max((visibleDuration - localTime) / s.finishDuration, 0), 1);
  const strength = settle * settle * (3 - 2 * settle);
  const halfWidth = height * 0.7;
  const diagonal = Math.SQRT1_2;
  const edgeMargin = 90;
  return {
    phase: progress * 1.3,
    center: -height * diagonal - halfWidth - edgeMargin +
      progress * ((width + height) * diagonal + (halfWidth + edgeMargin) * 2),
    halfWidth,
    strength,
    travel: progress * (width + height) * diagonal * 0.35,
  };
}

const VERTEX_SHADER = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
const FRAGMENT_SHADER = `
      precision highp float;
      uniform vec2 backing, size;
      uniform sampler2D image;
      uniform vec2 imageSize;
      uniform float phase, spacing, glow, waveCenter, waveHalfWidth, waveAmplitude, lightTravel;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec2 p=vec2(gl_FragCoord.x/backing.x,1.-gl_FragCoord.y/backing.y)*size;
        float tangent=dot(p,vec2(.70710678));
        float curve=30.*sin(tangent*.008-phase*.7)+16.*sin(tangent*.017+phase*.5);
        float localWidth=waveHalfWidth*(1.+.08*sin(tangent*.006+phase*.4));
        float distance=(dot(p,vec2(.70710678,-.70710678))-waveCenter-curve)/localWidth;
        float envelope=abs(distance)<1. ? .5+.5*cos(distance*3.14159265) : 0.;
        float forward=envelope*waveAmplitude;
        float lateral=forward*.28*sin(tangent*.011-phase*.5);
        p+=vec2(forward+lateral,lateral-forward)*.70710678;
        float coverScale=max(size.x/imageSize.x,size.y/imageSize.y);
        vec2 uv=((p-size*.5)/coverScale)/imageSize+.5;
        vec3 base=texture2D(image,vec2(uv.x,1.-uv.y)).rgb;
        p-=vec2(.70710678,-.70710678)*lightTravel;
        vec2 w=p+vec2(20.*sin(p.y*.024+phase*.48)+8.*sin((p.x+p.y)*.034-phase*.28),
          17.*sin(p.x*.023-phase*.41)+7.*cos((p.x-p.y)*.041+phase*.33));
        vec2 cell=floor(w/spacing);
        float field=0.;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
          vec2 g=cell+vec2(float(i),float(j));
          float a=hash(g),b=hash(g+vec2(43.,-17.));
          vec2 seed=(g+.2+vec2(a,b)*.6)*spacing+vec2(sin(phase*.44+a*6.28)*13.,cos(phase*.37+b*6.28)*15.);
          float angle=b*6.28+phase*.45,cs=cos(angle),sn=sin(angle);
          float radius=spacing*(.22+.24*envelope)*(.85+a*.3);
          vec2 delta=w-seed;
          vec2 ellipse=vec2(delta.x*cs+delta.y*sn,-delta.x*sn+delta.y*cs)/vec2(radius*(1.+a*.35),radius);
          field+=exp(-dot(ellipse,ellipse));
        }
        float rim=exp(-pow((field-.58)/.05,2.));
        float halo=exp(-pow((field-.58)/.28,2.));
        float shimmer=.65+.35*sin(w.x*.014+w.y*.012+phase*.6);
        float alpha=min(.6,glow*(rim*1.1+halo*.12)*shimmer)*envelope;
        vec3 light=vec3(248.,253.,239.)/255.;
        gl_FragColor=vec4(base+(1.-base)*light*alpha,1.);
      }`;

export interface RecognitionWaveController {
  finish(): Promise<void>;
  destroy(): void;
}

/** GPU-only decoration; the original photo remains underneath if WebGL is unavailable. */
export function startRecognitionWave(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
): RecognitionWaveController | null {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const gl = canvas.getContext("webgl", {
    alpha: true, premultipliedAlpha: false, depth: false, antialias: false,
  });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  let frameId = 0;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let finished = false;
  let startedAt = performance.now();
  let finishingAt: number | null = null;
  let finishPromise: Promise<void> | undefined;
  let resolveFinish: (() => void) | undefined;

  const release = () => {
    shaders.forEach((shader) => gl.deleteShader(shader));
    shaders.length = 0;
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    texture = null; buffer = null; program = null;
  };
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Wave shader unavailable");
    shaders.push(shader);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Wave shader unsupported");
    return shader;
  };

  try {
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error("Wave program unavailable");
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Wave program unsupported");
    shaders.forEach((shader) => gl.deleteShader(shader)); shaders.length = 0;
    buffer = gl.createBuffer(); texture = gl.createTexture();
    if (!buffer || !texture) throw new Error("Wave resources unavailable");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const uniforms = Object.fromEntries([
      "backing", "size", "imageSize", "phase", "spacing", "glow", "waveCenter", "waveHalfWidth",
      "waveAmplitude", "lightTravel", "image",
    ].map((name) => [name, gl.getUniformLocation(program!, name)]));
    gl.uniform1i(uniforms.image, 0);
    gl.uniform2f(uniforms.imageSize, image.naturalWidth || image.width, image.naturalHeight || image.height);

    const render = (now: number, strengthOverride?: number) => {
      const width = canvas.parentElement?.clientWidth || 320;
      const height = canvas.parentElement?.clientHeight || 450;
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const backingWidth = Math.round(width * ratio), backingHeight = Math.round(height * ratio);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth; canvas.height = backingHeight;
      }
      const state = getRecognitionWaveFrame(now - startedAt, width, height);
      const finishProgress = finishingAt === null ? 0 : Math.min((now - finishingAt) / RECOGNITION_WAVE_SETTINGS.finishDuration, 1);
      const finishStrength = 1 - finishProgress * finishProgress * (3 - 2 * finishProgress);
      const strength = strengthOverride ?? state.strength * finishStrength;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.backing, canvas.width, canvas.height); gl.uniform2f(uniforms.size, width, height);
      gl.uniform1f(uniforms.phase, state.phase); gl.uniform1f(uniforms.spacing, RECOGNITION_WAVE_SETTINGS.spacing);
      gl.uniform1f(uniforms.glow, RECOGNITION_WAVE_SETTINGS.glow * strength);
      gl.uniform1f(uniforms.waveCenter, state.center); gl.uniform1f(uniforms.waveHalfWidth, state.halfWidth);
      gl.uniform1f(uniforms.waveAmplitude, RECOGNITION_WAVE_SETTINGS.amplitude * strength);
      gl.uniform1f(uniforms.lightTravel, state.travel);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const complete = () => {
      if (finished || disposed) return;
      finished = true;
      cancelAnimationFrame(frameId);
      if (finishTimer !== undefined) clearTimeout(finishTimer);
      // Settle on the exact original cover image before background disintegration.
      if (!gl.isContextLost()) render(performance.now(), 0);
      resolveFinish?.();
    };
    const draw = (now: number) => {
      if (disposed || finished) return;
      if (gl.isContextLost()) {
        canvas.style.visibility = "hidden";
        complete();
        return;
      }
      render(now);
      if (finishingAt !== null && now - finishingAt >= RECOGNITION_WAVE_SETTINGS.finishDuration) {
        complete(); return;
      }
      frameId = requestAnimationFrame(draw);
    };
    const onContextLost = () => {
      canvas.style.visibility = "hidden";
      complete();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.style.visibility = "visible";
    startedAt = performance.now();
    draw(startedAt);
    return {
      finish() {
        if (disposed || finished) return Promise.resolve();
        if (finishPromise) return finishPromise;
        finishingAt = performance.now();
        finishPromise = new Promise<void>((resolve) => { resolveFinish = resolve; });
        // Animation frames may pause when switching apps. Never block result handoff on rAF.
        finishTimer = setTimeout(complete, RECOGNITION_WAVE_SETTINGS.finishDuration);
        return finishPromise;
      },
      destroy() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frameId);
        if (finishTimer !== undefined) clearTimeout(finishTimer);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.style.visibility = "hidden";
        resolveFinish?.();
        release();
      },
    };
  } catch {
    cancelAnimationFrame(frameId);
    release();
    canvas.style.visibility = "hidden";
    return null;
  }
}
