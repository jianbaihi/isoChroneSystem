(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CENTER = { x: 700, y: 550 };
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  let revision = 0;

  const fallbackLayers = [
    {
      time: 10,
      targetRadius: 92,
      maxRadius: 150,
      bandwidth: 24,
      fill: '#edf5e7',
      stroke: '#6c9d49',
      categories: [
        {
          name: '便民服务',
          color: '#c8ddb1',
          text: '#5e7f42',
          icon: '⌖',
          angle: -Math.PI / 2,
          parent: { label: '便民服务', radius: 38, count: 1035 },
          children: [
            ['水果店', 22], ['药店', 22], ['洗衣店', 22], ['打印店', 21],
            ['社区服务站', 24], ['理发店', 19], ['面包店', 19], ['便利店', 20],
          ],
        },
      ],
    },
    {
      time: 20,
      targetRadius: 200,
      maxRadius: 285,
      bandwidth: 30,
      fill: '#f5f9fe',
      stroke: '#1677f3',
      categories: [
        {
          name: '餐饮美食', color: '#f6c75f', text: '#c86b00', icon: '♨', angle: -2.36,
          parent: { label: '餐饮美食', radius: 52, count: 2689 },
          children: [['火锅', 25], ['咖啡', 24], ['烧烤', 24], ['川菜', 21], ['甜品', 21], ['串串香', 21]],
        },
        {
          name: '购物商场', color: '#f2aebc', text: '#c83d5f', icon: '▣', angle: -0.94,
          parent: { label: '购物商场', radius: 53, count: 2214 },
          children: [['商超', 25], ['百货', 25], ['购物中心', 25], ['便利店', 21], ['综合市场', 21]],
        },
        {
          name: '酒店住宿', color: '#c3a9e5', text: '#7147b1', icon: '▣', angle: 0.42,
          parent: { label: '酒店住宿', radius: 48, count: 1271 },
          children: [['连锁酒店', 24], ['经济酒店', 24], ['民宿', 20], ['公寓酒店', 21]],
        },
        {
          name: '生活服务', color: '#9bd6d0', text: '#18857f', icon: '⌁', angle: 1.48,
          parent: { label: '快递服务', radius: 49, count: 1638 },
          children: [['银行', 24], ['美容服务', 24], ['ATM', 20], ['菜鸟驿站', 21]],
        },
        {
          name: '交通设施', color: '#8fc4f3', text: '#1671c9', icon: '▤', angle: 2.68,
          parent: { label: '交通设施', radius: 50, count: 1742 },
          children: [['地铁站', 25], ['停车场', 25], ['公交站', 21], ['P+R', 20]],
        },
      ],
    },
    {
      time: 30,
      targetRadius: 365,
      maxRadius: 445,
      bandwidth: 34,
      fill: '#faf6fc',
      stroke: '#9f78dc',
      categories: [
        {
          name: '医疗健康', color: '#efb6cc', text: '#c7577b', icon: '✚', angle: -2.14,
          parent: { label: '医疗健康', radius: 45, count: 523 },
          children: [['综合医院', 21], ['专科医院', 21], ['眼科', 18], ['药店', 18]],
        },
        {
          name: '景点休闲', color: '#f2d7a4', text: '#bf8430', icon: '♜', angle: -1.05,
          parent: { label: '景点休闲', radius: 46, count: 1176 },
          children: [['博物馆', 21], ['展览馆', 21], ['植物园', 18], ['科技馆', 18]],
        },
        {
          name: '休闲娱乐', color: '#f4c9af', text: '#d97955', icon: '☺', angle: -0.2,
          parent: { label: '休闲娱乐', radius: 45, count: 252 },
          children: [['电影院', 21], ['KTV', 21], ['桌游馆', 18]],
        },
        {
          name: '生活服务', color: '#c9dfbe', text: '#598a4d', icon: '⌁', angle: 0.72,
          parent: { label: '生活服务', radius: 45, count: 2397 },
          children: [['快递服务', 21], ['洗衣店', 21], ['维修服务', 18]],
        },
        {
          name: '酒店住宿', color: '#b8d5f2', text: '#3977bd', icon: '▣', angle: 1.76,
          parent: { label: '酒店住宿', radius: 46, count: 2010 },
          children: [['经济酒店', 21], ['精品酒店', 21], ['公寓酒店', 18]],
        },
        {
          name: '教育培训', color: '#cbb4ed', text: '#7652b7', icon: '◆', angle: 2.8,
          parent: { label: '教育培训', radius: 45, count: 1440 },
          children: [['早教', 21], ['少儿编程', 21], ['职业培训', 18], ['艺术培训', 18]],
        },
      ],
    },
  ];

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function polarRadius(contour, angle) {
    if (!contour?.radii?.length) return 70;
    const count = contour.radii.length;
    const normalized = ((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * count;
    const low = Math.floor(normalized) % count;
    const high = (low + 1) % count;
    const mix = normalized - Math.floor(normalized);
    return contour.radii[low] * (1 - mix) + contour.radii[high] * mix;
  }

  function clampToAnnulus(node, previousContour, maxRadius) {
    const dx = node.x - CENTER.x;
    const dy = node.y - CENTER.y;
    const angle = Math.atan2(dy, dx);
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const inner = (previousContour ? polarRadius(previousContour, angle) : 70) + node.r + 13;
    const outer = maxRadius - node.r - 10;
    const target = Math.max(inner, Math.min(outer, distance));
    if (Math.abs(target - distance) > 0.01) {
      node.x = CENTER.x + (dx / distance) * target;
      node.y = CENTER.y + (dy / distance) * target;
      node.vx *= 0.45;
      node.vy *= 0.45;
    }
  }

  function makeLayerNodes(layer, previousContour, random) {
    const nodes = [];
    const angleShift = (random() - 0.5) * 0.08;
    layer.categories.forEach((category, categoryIndex) => {
      const categoryAngle = category.angle + angleShift;
      const targetRadius = Math.max(
        layer.targetRadius,
        (previousContour ? polarRadius(previousContour, categoryAngle) : 70) + category.parent.radius + 18,
      );
      const parent = {
        id: `${layer.time}-${categoryIndex}-parent`,
        layer: layer.time,
        category,
        label: category.parent.label,
        count: category.parent.count,
        poiIds: category.parent.poiIds || [],
        level: 1,
        r: category.parent.radius,
        x: CENTER.x + Math.cos(categoryAngle) * targetRadius,
        y: CENTER.y + Math.sin(categoryAngle) * targetRadius,
        vx: 0,
        vy: 0,
        targetX: CENTER.x + Math.cos(categoryAngle) * targetRadius,
        targetY: CENTER.y + Math.sin(categoryAngle) * targetRadius,
      };
      nodes.push(parent);

      category.children.forEach((childSpec, childIndex) => {
        const [label, radius, poiIds] = Array.isArray(childSpec)
          ? [childSpec[0], childSpec[1], childSpec[2] || []]
          : [childSpec.label, childSpec.radius, childSpec.poiIds || []];
        const fan = categoryAngle + (childIndex - (category.children.length - 1) / 2) * 0.62 + GOLDEN_ANGLE * 0.08;
        const desired = parent.r + radius + 5;
        nodes.push({
          id: `${layer.time}-${category.categoryId || category.name}-${childIndex}`,
          layer: layer.time,
          category,
          categoryId: childSpec.categoryId || category.categoryId,
          categoryPath: childSpec.categoryPath || category.categoryPath || [],
          hasChildren: Boolean(childSpec.hasChildren),
          label,
          poiIds,
          level: childIndex < Math.ceil(category.children.length * 0.58) ? 2 : 3,
          r: radius,
          x: parent.x + Math.cos(fan) * desired,
          y: parent.y + Math.sin(fan) * desired,
          vx: 0,
          vy: 0,
          parent,
          orbitAngle: fan,
          orbitDistance: desired,
        });
      });
    });
    return nodes;
  }

  function resolveCollisions(nodes, previousContour, maxRadius, iterations = 460) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const alpha = 0.14 + 0.86 * (1 - iteration / iterations);

      nodes.forEach((node) => {
        let targetX = node.targetX;
        let targetY = node.targetY;
        let strength = 0.018;
        if (node.parent) {
          targetX = node.parent.x + Math.cos(node.orbitAngle) * node.orbitDistance;
          targetY = node.parent.y + Math.sin(node.orbitAngle) * node.orbitDistance;
          strength = 0.034;
        }
        node.vx += (targetX - node.x) * strength * alpha;
        node.vy += (targetY - node.y) * strength * alpha;
      });

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.hypot(dx, dy);
          if (distance < 0.001) {
            dx = 0.01 * (j + 1);
            dy = 0.01 * (i + 1);
            distance = Math.hypot(dx, dy);
          }
          const sameCategory = a.category === b.category;
          const gap = sameCategory ? 2.5 : 7;
          const minimum = a.r + b.r + gap;
          if (distance < minimum) {
            const push = ((minimum - distance) / distance) * 0.54;
            const px = dx * push;
            const py = dy * push;
            a.vx -= px;
            a.vy -= py;
            b.vx += px;
            b.vy += py;
          } else if (sameCategory && distance < minimum + 62) {
            const attraction = (distance - minimum) * 0.0007 * alpha;
            a.vx += dx * attraction;
            a.vy += dy * attraction;
            b.vx -= dx * attraction;
            b.vy -= dy * attraction;
          }
        }
      }

      nodes.forEach((node) => {
        node.vx *= 0.68;
        node.vy *= 0.68;
        node.x += node.vx;
        node.y += node.vy;
        clampToAnnulus(node, previousContour, maxRadius);
      });
    }

    for (let pass = 0; pass < 90; pass += 1) {
      let moved = false;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.hypot(dx, dy);
          if (distance < 0.001) {
            dx = 0.1;
            dy = 0;
            distance = 0.1;
          }
          const gap = a.category === b.category ? 2.5 : 7;
          const minimum = a.r + b.r + gap;
          if (distance < minimum) {
            const correction = (minimum - distance + 0.2) / distance / 2;
            const px = dx * correction;
            const py = dy * correction;
            a.x -= px;
            a.y -= py;
            b.x += px;
            b.y += py;
            clampToAnnulus(a, previousContour, maxRadius);
            clampToAnnulus(b, previousContour, maxRadius);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return nodes;
  }

  function densitySamples(nodes, includeCenter) {
    const points = [];
    if (includeCenter) {
      points.push({ x: CENTER.x, y: CENTER.y, weight: 2.4 });
      for (let i = 0; i < 16; i += 1) {
        const angle = i / 16 * Math.PI * 2;
        points.push({ x: CENTER.x + Math.cos(angle) * 54, y: CENTER.y + Math.sin(angle) * 54, weight: 1 });
      }
    }
    nodes.forEach((node) => {
      points.push({ x: node.x, y: node.y, weight: 2 });
      [0.48, 0.82, 1].forEach((ratio, ringIndex) => {
        const samples = ringIndex === 2 ? 16 : 8;
        for (let i = 0; i < samples; i += 1) {
          const angle = i / samples * Math.PI * 2 + ringIndex * 0.17;
          points.push({
            x: node.x + Math.cos(angle) * node.r * ratio,
            y: node.y + Math.sin(angle) * node.r * ratio,
            weight: ratio === 1 ? 0.85 : 1,
          });
        }
      });
    });
    return points;
  }

  function rayRequiredRadius(nodes, angle, padding) {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    let required = 66 + padding;
    nodes.forEach((node) => {
      const cx = node.x - CENTER.x;
      const cy = node.y - CENTER.y;
      const projection = cx * ux + cy * uy;
      const perpendicularSquared = cx * cx + cy * cy - projection * projection;
      const radius = node.r + padding;
      if (projection > 0 && perpendicularSquared <= radius * radius) {
        required = Math.max(required, projection + Math.sqrt(Math.max(0, radius * radius - perpendicularSquared)));
      }
    });
    return required;
  }

  function smoothCircular(values, passes = 4) {
    let current = values.slice();
    for (let pass = 0; pass < passes; pass += 1) {
      current = current.map((value, index) => {
        const count = current.length;
        return (
          current[(index - 2 + count) % count]
          + current[(index - 1 + count) % count] * 2
          + value * 3
          + current[(index + 1) % count] * 2
          + current[(index + 2) % count]
        ) / 9;
      });
    }
    return current;
  }

  function catmullRomClosed(points) {
    const count = points.length;
    let path = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
    for (let i = 0; i < count; i += 1) {
      const p0 = points[(i - 1 + count) % count];
      const p1 = points[i];
      const p2 = points[(i + 1) % count];
      const p3 = points[(i + 2) % count];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      path += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return `${path}Z`;
  }

  function kdeContour(nodes, options) {
    const sampleCount = 120;
    const radialStep = 7;
    const maxSearchRadius = options.maxRadius;
    const points = densitySamples(nodes, true);
    const bandwidthSquared = options.bandwidth * options.bandwidth;
    const threshold = 1.05;
    const required = [];
    const rawRadii = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const angle = index / sampleCount * Math.PI * 2;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      let densityRadius = 70;
      for (let radius = 70; radius <= maxSearchRadius; radius += radialStep) {
        const x = CENTER.x + ux * radius;
        const y = CENTER.y + uy * radius;
        let density = 0;
        for (let p = 0; p < points.length; p += 1) {
          const dx = x - points[p].x;
          const dy = y - points[p].y;
          density += points[p].weight * Math.exp(-(dx * dx + dy * dy) / (2 * bandwidthSquared));
        }
        if (density >= threshold) densityRadius = radius;
      }
      const needed = rayRequiredRadius(nodes, angle, options.padding);
      required.push(needed);
      rawRadii.push(Math.max(needed, densityRadius));
    }

    let radii = smoothCircular(rawRadii, 5);
    radii = radii.map((radius, index) => Math.max(required[index], radius));
    for (let pass = 0; pass < 5; pass += 1) {
      radii = radii.map((radius, index) => {
        const before = radii[(index - 1 + radii.length) % radii.length];
        const after = radii[(index + 1) % radii.length];
        return Math.max(required[index], Math.min(radius, Math.max(before, after) + 24));
      });
    }

    const contourPoints = radii.map((radius, index) => {
      const angle = index / sampleCount * Math.PI * 2;
      return [CENTER.x + Math.cos(angle) * radius, CENTER.y + Math.sin(angle) * radius];
    });
    return { radii, points: contourPoints, path: catmullRomClosed(contourPoints) };
  }

  function blobPath(node, random) {
    const pointCount = node.level === 1 ? 13 : 11;
    const points = [];
    for (let index = 0; index < pointCount; index += 1) {
      const angle = index / pointCount * Math.PI * 2;
      const wobble = 0.94 + random() * 0.055;
      const radius = node.r * wobble;
      points.push([node.x + Math.cos(angle) * radius, node.y + Math.sin(angle) * radius]);
    }
    return catmullRomClosed(points);
  }

  function renderCategory(layerGroup, category, nodes, random) {
    const group = svgElement('g', {
      class: 'category-cluster dynamic-category-cluster',
      'data-category': category.name,
      'data-category-id': category.categoryId || category.name,
      'data-ring-id': category.ringId || layerGroup.dataset.ringId || '',
      style: `--cluster-fill:${category.color};--cluster-text:${category.text}`,
    });
    nodes.filter((node) => node.category === category).forEach((node) => {
      const bubble = svgElement('g', {
        class: `force-bubble force-bubble-level-${node.level}`,
        'data-bubble-id': node.id,
        'data-category-id': node.categoryId || category.categoryId || category.name,
        'data-ring-id': category.ringId || layerGroup.dataset.ringId || '',
        'data-category-path': (node.categoryPath || category.categoryPath || []).join(','),
        'data-has-children': node.hasChildren ? 'true' : 'false',
        'data-poi-id': node.level === 1 || node.hasChildren ? '' : (node.poiIds?.[0] || ''),
        'data-poi-ids': (node.poiIds || []).join(','),
      });
      const path = svgElement('path', {
        class: `hierarchy-node level-${node.level}`,
        d: blobPath(node, random),
      });
      bubble.appendChild(path);
      const title = svgElement('title');
      title.textContent = node.count ? `${node.label} · ${node.count.toLocaleString()} 个 POI` : node.label;
      path.appendChild(title);

      if (node.level === 1) {
        const icon = svgElement('text', {
          class: 'node-icon level-1-text',
          x: node.x,
          y: node.y - 7,
        });
        icon.textContent = category.icon;
        bubble.appendChild(icon);
        const label = svgElement('text', {
          class: 'node-label level-1-text',
          x: node.x,
          y: node.y + 24,
        });
        label.textContent = node.label;
        bubble.appendChild(label);
      } else {
        const label = svgElement('text', {
          class: `node-label level-${node.level}-text`,
          x: node.x,
          y: node.y + 4,
        });
        label.textContent = node.label;
        bubble.appendChild(label);
      }
      group.appendChild(bubble);
    });
    layerGroup.appendChild(group);
  }

  function contourTopPoint(contour) {
    let top = contour.points[0];
    contour.points.forEach((point) => {
      if (point[1] < top[1]) top = point;
    });
    return top;
  }

  function renderLayer(organicMap, layer, nodes, contour, random) {
    const layerGroup = svgElement('g', {
      class: `organic-time-layer organic-layer-${layer.time} dynamic-time-layer`,
      'data-time-layer': layer.time,
      'data-ring-id': layer.ringId || `ring-0-${layer.time}`,
    });
    layerGroup.appendChild(svgElement('path', {
      class: 'kde-layer-fill',
      d: contour.path,
      fill: layer.fill,
    }));
    layer.categories.forEach((category) => renderCategory(layerGroup, category, nodes, random));
    layerGroup.appendChild(svgElement('path', {
      class: 'density-boundary kde-density-boundary',
      d: contour.path,
      'data-kde-bandwidth': layer.bandwidth,
      'data-density-source': 'bubble-boundary-and-interior',
    }));

    const top = contourTopPoint(contour);
    const chip = svgElement('g', {
      class: 'organic-layer-chip',
      'data-layer-target': layer.time,
      role: 'button',
      'aria-label': `聚焦${layer.time}分钟圈层`,
      transform: `translate(${(top[0] - 50).toFixed(1)} ${(top[1] - 20).toFixed(1)})`,
    });
    chip.appendChild(svgElement('rect', { width: 100, height: 40, rx: 20 }));
    const chipText = svgElement('text', { x: 50, y: 26 });
    chipText.textContent = `${layer.time}分钟`;
    chip.appendChild(chipText);
    layerGroup.appendChild(chip);
    organicMap.appendChild(layerGroup);
  }

  function nameCloudContour(radius) {
    const sampleCount = 120;
    const points = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const angle = index / sampleCount * Math.PI * 2;
      points.push([CENTER.x + Math.cos(angle) * radius, CENTER.y + Math.sin(angle) * radius]);
    }
    return { radii: Array(sampleCount).fill(radius), points, path: catmullRomClosed(points) };
  }

  function measureNameCloudLabel(label) {
    const canvas = measureNameCloudLabel.canvas || (measureNameCloudLabel.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    if (!context) return { width: Math.max(28, String(label).length * 14), height: 24 };
    context.font = '600 13px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
    return { width: Math.max(30, Math.ceil(context.measureText(String(label)).width) + 14), height: 24 };
  }

  function rectanglesOverlap(left, right, gap = 5) {
    return !(left.right + gap <= right.left || right.right + gap <= left.left || left.bottom + gap <= right.top || right.bottom + gap <= left.top);
  }

  function layoutNameCloudLayer(layer, previousContour) {
    const labels = [...(layer.labels || [])].sort((left, right) => {
      const sizeDelta = measureNameCloudLabel(right.label).width - measureNameCloudLabel(left.label).width;
      return sizeDelta || left.poiId.localeCompare(right.poiId);
    });
    const placed = [];
    const unplaced = [];
    const innerFor = (angle) => previousContour ? polarRadius(previousContour, angle) + 18 : 72;
    labels.forEach((label, labelIndex) => {
      const size = measureNameCloudLabel(label.label);
      let found = null;
      for (let candidateIndex = 0; candidateIndex < 720; candidateIndex += 1) {
        const angle = (candidateIndex * GOLDEN_ANGLE + labelIndex * 0.19) % (Math.PI * 2);
        const ratio = ((candidateIndex % 48) + 1) / 49;
        const distance = Math.sqrt((innerFor(angle) ** 2) * (1 - ratio) + (layer.maxRadius - 14) ** 2 * ratio);
        const x = CENTER.x + Math.cos(angle) * distance;
        const y = CENTER.y + Math.sin(angle) * distance;
        const rect = { left: x - size.width / 2, right: x + size.width / 2, top: y - size.height / 2, bottom: y + size.height / 2 };
        const radial = Math.hypot(x - CENTER.x, y - CENTER.y);
        const radius = Math.max(size.width, size.height) / 2;
        if (radial - radius < innerFor(angle) || radial + radius > layer.maxRadius - 10) continue;
        if (placed.some((node) => rectanglesOverlap(rect, node.rect))) continue;
        found = { ...label, x, y, width: size.width, height: size.height, r: radius, rect };
        break;
      }
      if (found) placed.push(found);
      else unplaced.push(label);
    });
    return { placed, unplaced, contour: nameCloudContour(layer.maxRadius) };
  }

  function renderNameCloudLayer(organicMap, layer, layout) {
    const layerGroup = svgElement('g', {
      class: `organic-time-layer organic-layer-${layer.time} dynamic-time-layer name-cloud-time-layer`,
      'data-time-layer': layer.time,
      'data-ring-id': layer.ringId || `ring-0-${layer.time}`,
      'data-name-cloud-band': `${layer.time}`,
    });
    layerGroup.appendChild(svgElement('path', {
      class: 'kde-layer-fill name-cloud-band-fill',
      d: layout.contour.path,
      fill: layer.fill,
      stroke: layer.stroke,
      'stroke-width': 2,
    }));
    layout.placed.forEach((node) => {
      const bubble = svgElement('g', {
        class: 'force-bubble name-cloud-label',
        'data-bubble-id': `name-cloud-${node.poiId}`,
        'data-poi-id': node.poiId,
        'data-poi-ids': node.poiId,
        'data-ring-id': layer.ringId || '',
        'data-category-id': '',
        'data-has-children': 'false',
        transform: `translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})`,
      });
      bubble.appendChild(svgElement('rect', {
        class: 'name-cloud-label-bg',
        x: (-node.width / 2).toFixed(1),
        y: (-node.height / 2).toFixed(1),
        width: node.width,
        height: node.height,
        rx: 12,
      }));
      const text = svgElement('text', { class: 'name-cloud-label-text', x: 0, y: 4, fill: layer.text });
      text.textContent = node.label;
      bubble.appendChild(text);
      const title = svgElement('title');
      title.textContent = `${node.label} · ${layer.time} 分钟圈层`;
      bubble.appendChild(title);
      layerGroup.appendChild(bubble);
    });
    layerGroup.appendChild(svgElement('path', {
      class: 'density-boundary kde-density-boundary name-cloud-boundary',
      d: layout.contour.path,
      'data-density-source': 'deterministic-name-cloud-band',
    }));
    const top = contourTopPoint(layout.contour);
    const chip = svgElement('g', {
      class: 'organic-layer-chip',
      'data-layer-target': layer.time,
      role: 'button',
      'aria-label': `${layer.time}分钟名称云圈层，已显示${layout.placed.length}个，未显示${layout.unplaced.length}个`,
      transform: `translate(${(top[0] - 50).toFixed(1)} ${(top[1] - 20).toFixed(1)})`,
    });
    chip.appendChild(svgElement('rect', { width: 100, height: 40, rx: 20 }));
    const chipText = svgElement('text', { x: 50, y: 26 });
    chipText.textContent = `${layer.time}分钟`;
    chip.appendChild(chipText);
    layerGroup.appendChild(chip);
    organicMap.appendChild(layerGroup);
  }

  function renderCenter(organicMap, centerLabel = '未生成') {
    const labelText = String(centerLabel || '未生成');
    const center = svgElement('g', { class: 'organic-center', 'aria-label': `中心点${labelText}` });
    center.appendChild(svgElement('circle', { cx: CENTER.x, cy: CENTER.y, r: 57, fill: '#eef5e5', stroke: '#fff', 'stroke-width': 4 }));
    center.appendChild(svgElement('circle', { cx: CENTER.x, cy: CENTER.y, r: 54, fill: 'url(#centerHex)' }));
    const pin = svgElement('g', { transform: `translate(${CENTER.x} ${CENTER.y - 7})`, filter: 'url(#pinShadow)' });
    pin.innerHTML = '<path d="M0 24c-11-19-22-31-22-46a22 22 0 1 1 44 0C22-7 11 5 0 24Z" fill="#e7474f" stroke="#fff" stroke-width="4"/><circle cy="-22" r="7" fill="#fff"/>';
    center.appendChild(pin);
    const label = svgElement('text', { x: CENTER.x, y: CENTER.y + 40 });
    label.textContent = labelText;
    center.appendChild(label);
    organicMap.appendChild(center);
  }

  function minimumGap(nodes) {
    let minimum = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const gap = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) - nodes[i].r - nodes[j].r;
        minimum = Math.min(minimum, gap);
      }
    }
    return minimum;
  }

  function contourClearance(nodes, contour, inside = true) {
    let minimum = Infinity;
    nodes.forEach((node) => {
      const dx = node.x - CENTER.x;
      const dy = node.y - CENTER.y;
      const angle = Math.atan2(dy, dx);
      const distance = Math.hypot(dx, dy);
      const clearance = inside
        ? polarRadius(contour, angle) - distance - node.r
        : distance - node.r - polarRadius(contour, angle);
      minimum = Math.min(minimum, clearance);
    });
    return minimum;
  }

  function normalizeLayers(input) {
    if (!Array.isArray(input) || input.length === 0) return null;
    const isValid = input.every((layer) => {
      if (!layer || !Number.isFinite(Number(layer.time)) || Number(layer.time) <= 0) return false;
      if (layer.mode === 'unclassified-poi-name-cloud') return Array.isArray(layer.labels);
      return Array.isArray(layer.categories) && layer.categories.every((category) => category && Array.isArray(category.children));
    });
    return isValid ? input : null;
  }

  let lastValidLayers = fallbackLayers;

  function buildOrganicPanmap(input = fallbackLayers) {
    const organicMap = document.querySelector('.organic-map');
    if (!organicMap) return null;
    const options = Array.isArray(input) ? {} : (input || {});
    const requestedLayers = Array.isArray(input) ? input : (Array.isArray(options.layers) ? options.layers : lastValidLayers);
    const nextLayers = normalizeLayers(requestedLayers);
    if (!nextLayers) {
      window.panmapLayoutError = { code: 'INVALID_LAYOUT_INPUT', message: '泛地图布局输入无效，已保留当前视图。' };
      return null;
    }
    lastValidLayers = nextLayers;
    revision += 1;
    if (nextLayers.some((layer) => layer.mode === 'unclassified-poi-name-cloud')) {
      const nameCloudLayouts = [];
      let previousNameCloudContour = null;
      nextLayers.forEach((layer) => {
        const layout = layoutNameCloudLayer(layer, previousNameCloudContour);
        nameCloudLayouts.push({ layer, ...layout });
        previousNameCloudContour = layout.contour;
      });
      organicMap.replaceChildren();
      organicMap.classList.add('dynamic-density-map', 'is-name-cloud-mode');
      nameCloudLayouts.slice().reverse().forEach(({ layer, ...layout }) => renderNameCloudLayer(organicMap, layer, layout));
      renderCenter(organicMap, options.centerLabel);
      const placedCount = nameCloudLayouts.reduce((sum, item) => sum + item.placed.length, 0);
      const unplacedCount = nameCloudLayouts.reduce((sum, item) => sum + item.unplaced.length, 0);
      organicMap.dataset.layoutRevision = String(revision);
      organicMap.dataset.layoutEngine = 'deterministic-name-cloud-candidate-placement';
      organicMap.dataset.nameCloudPlaced = String(placedCount);
      organicMap.dataset.nameCloudUnplaced = String(unplacedCount);
      organicMap.dataset.nameCloudBands = JSON.stringify(nameCloudLayouts.map((item) => ({
        time: item.layer.time,
        available: item.layer.labels.length,
        placed: item.placed.length,
        unplaced: item.unplaced.length,
      })));
      window.panmapLayoutState = {
        revision,
        layouts: nameCloudLayouts,
        minimumBubbleGap: null,
        inputLayers: nextLayers,
        nameCloudStats: {
          placedCount,
          unplacedCount,
          bands: nameCloudLayouts.map((item) => ({ time: item.layer.time, available: item.layer.labels.length, placed: item.placed.length, unplaced: item.unplaced.length })),
        },
      };
      return window.panmapLayoutState;
    }
    const random = seededRandom(20260726 + revision * 7919 + (options.seedOffset || 0));
    const layouts = [];
    let previousContour = null;
    let cumulativeNodes = [];

    nextLayers.forEach((layer) => {
      const nodes = makeLayerNodes(layer, previousContour, random);
      resolveCollisions(nodes, previousContour, layer.maxRadius);
      cumulativeNodes = cumulativeNodes.concat(nodes);
      const contour = kdeContour(cumulativeNodes, {
        bandwidth: layer.bandwidth,
        maxRadius: layer.maxRadius + 34,
        padding: layer.time === 10 ? 14 : 17,
      });
      layouts.push({ layer, nodes, contour });
      previousContour = contour;
    });

    organicMap.replaceChildren();
    organicMap.classList.add('dynamic-density-map');
    layouts.slice().reverse().forEach(({ layer, nodes, contour }) => renderLayer(organicMap, layer, nodes, contour, random));
    renderCenter(organicMap, options.centerLabel);
    organicMap.dataset.layoutRevision = String(revision);
    organicMap.dataset.layoutEngine = 'force-collision+kde-polar-level-set';
    organicMap.dataset.minimumBubbleGap = Math.min(...layouts.map(({ nodes }) => minimumGap(nodes))).toFixed(2);
    organicMap.dataset.constraintAudit = JSON.stringify(layouts.map(({ layer, nodes, contour }, index) => ({
      time: layer.time,
      minimumBubbleGap: Number(minimumGap(nodes).toFixed(2)),
      innerContourClearance: index === 0 ? null : Number(contourClearance(nodes, layouts[index - 1].contour, false).toFixed(2)),
      outerContourClearance: Number(contourClearance(nodes, contour, true).toFixed(2)),
    })));

    window.panmapLayoutState = {
      revision,
      layouts,
      minimumBubbleGap: Number(organicMap.dataset.minimumBubbleGap),
      inputLayers: nextLayers,
    };
    return window.panmapLayoutState;
  }

  window.rebuildPanmapLayout = (input = fallbackLayers) => buildOrganicPanmap(input);
  window.panmapFallbackLayers = fallbackLayers;
  buildOrganicPanmap(fallbackLayers);
})();
