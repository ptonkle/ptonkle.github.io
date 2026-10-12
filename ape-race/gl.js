// The WebGL 2 renderer. It uploads what the core returns and draws it;
// every size, stride and offset comes from the core's numbers(), so this
// file holds no layout of its own.

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function link(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

// Returns null when the browser has no WebGL 2; the page then says so.
export function makeRenderer(canvas, N, shaders, meshData, sceneUniforms, clearColour) {
  const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;

  const program = link(gl, shaders.vertex, shaders.fragment);
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const meshes = N.meshes.map((m) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, meshData(m.id), gl.STATIC_DRAW);
    return { buffer, vertices: m.vertices };
  });

  const attribute = ([name, size, offset]) => ({ loc: gl.getAttribLocation(program, name), size, offset });
  const vertexAttributes = N.vertex.attributes.map(attribute);
  const instanceAttributes = N.instance.attributes.map(attribute);
  for (const a of vertexAttributes.concat(instanceAttributes)) gl.enableVertexAttribArray(a.loc);
  for (const a of instanceAttributes) gl.vertexAttribDivisor(a.loc, 1);

  const uniform = (name) => gl.getUniformLocation(program, name);
  const uVP = uniform("uVP");
  const uEye = uniform("uEye");
  const uFogRange = uniform("uFogRange");
  const uFog = uniform("uFog");
  const uSky = uniform("uSky");
  const V = N.view;

  let at = 0;
  for (const [name, size] of N.uniforms) {
    gl[`uniform${size}fv`](uniform(name), sceneUniforms.subarray(at, at + size));
    at += size;
  }
  const [r, g, b] = clearColour;
  gl.clearColor(r, g, b, 1);

  const instanceBuffers = [gl.createBuffer(), gl.createBuffer()];

  function drawList(draws) {
    for (let i = 0; i < draws.length; i += N.draw_values) {
      const [buffer, meshId, byteOffset, count, first, vertices] = draws.subarray(i, i + N.draw_values);
      const mesh = meshes[meshId];
      if (!mesh.vertices) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      for (const a of vertexAttributes) {
        gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, N.vertex.stride, a.offset);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffers[buffer]);
      for (const a of instanceAttributes) {
        gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, N.instance.stride, a.offset + byteOffset);
      }
      gl.drawArraysInstanced(gl.TRIANGLES, first, vertices || mesh.vertices, count);
    }
  }

  return {
    // What never moves: uploaded once per stage, with the ground's mesh.
    // Which of it to draw comes with each frame.
    setScene(values, terrain) {
      const ground = meshes[N.terrain_mesh];
      gl.bindBuffer(gl.ARRAY_BUFFER, ground.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, terrain, gl.STATIC_DRAW);
      ground.vertices = terrain.length / N.vertex.values;
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffers[N.buffers.static]);
      gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    },
    frame(view, values, draws) {
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffers[N.buffers.dynamic]);
      gl.bufferData(gl.ARRAY_BUFFER, values, gl.STREAM_DRAW);
      // the fog and sky colours come with each frame (they change at speed)
      const [fr, fg, fb] = view.subarray(...V.fog_colour);
      gl.clearColor(fr, fg, fb, 1);
      gl.uniform3fv(uFog, view.subarray(...V.fog_colour));
      gl.uniform3fv(uSky, view.subarray(...V.sky));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(uVP, false, view.subarray(...V.matrix));
      gl.uniform3fv(uEye, view.subarray(...V.eye));
      gl.uniform2fv(uFogRange, view.subarray(...V.fog));
      drawList(draws);
    },
  };
}
