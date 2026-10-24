(function (window) {
    'use strict';



    function initMap() {

        var layers = [];
        var layerId = 0;
        var control;
        var L = window.L;


        // 背景地図の設定　

        var osm = L.tileLayer(
            'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: 'Map data &copy; 2013 OpenStreetMap contributors' }
        );

        // 国土地理院 標準地図
        var gsi_std = L.tileLayer(
            'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
            { attribution: '© 国土地理院' }
        );

        // 国土地理院 淡色地図
        var gsi_pale = L.tileLayer(
            'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
            { attribution: '© 国土地理院' }
        );

        // Google Sattelite
        var google_sat = L.tileLayer(
            'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            { attribution: '© google' }
        )

        var map = L.map('map', {
            center: [44, 142.5],
            zoom: 7,
            preferCanvas: true
        }).addLayer(osm);

        var baseMaps = {
            "OpenStreetMap": osm,
            "国土地理院 標準": gsi_std,
            "国土地理院 淡色": gsi_pale,
            "Google航空": google_sat
        };

        // 背景切替コントロール追加

        L.control.scale({ position: 'bottomright' }).addTo(map);
        L.control.layers(baseMaps, null, {
            position: "bottomright",
            collapsed: true
        }).addTo(map);

        const DEFAULT_STYLE = {
            color: "#3388ff",
            fillColor: "#3388ff",
            radius: 4,
            opacity: 1.0,
            fillOpacity: 0.8,
            weight: 1,
            interactive: true
        };


        var fileControl = L.control({ position: 'topleft' });
        fileControl.onAdd = function () {

            var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');

            var link = L.DomUtil.create('a', '', container);
            link.href = '#';
            link.title = "GeoJSONを追加";
            link.innerHTML = '<img class="icon" src="folder.svg" alt="file icon"/>';

            // 隠しinput
            var input = L.DomUtil.create('input', '', container);
            input.type = "file";
            input.accept = ".geojson,.json";
            input.style.display = "none";

            // ボタン押したらinputを開く
            L.DomEvent.on(link, 'click', function (e) {
                L.DomEvent.stop(e);
                input.click();
            });

            // ファイル読み込み
            L.DomEvent.on(input, 'change', function (e) {

                var file = e.target.files[0];
                if (!file) return;

                // 既存レイヤ名チェック
                var exists = layers.some(function (entry) {
                    return entry.name === file.name;
                });

                if (exists) {
                    alert("同じ名前のレイヤはすでに追加されています。");
                    return;
                }

                var reader = new FileReader();
                reader.onload = function (evt) {

                    try {
                        var data = JSON.parse(evt.target.result);

                        var layer = L.geoJSON(data, {
                            style: DEFAULT_STYLE,
                            onEachFeature: function (feature, layer) {

                                if (!feature.properties) return;

                                var html = "<table>";

                                Object.keys(feature.properties).forEach(function (key) {
                                    html += "<tr>";
                                    html += "<th style='text-align:left;padding-right:6px;'>" + key + "</th>";
                                    html += "<td>" + feature.properties[key] + "</td>";
                                    html += "</tr>";
                                });

                                html += "</table>";
                                layer.bindPopup(html);
                            },
                            //renderer: L.canvas(),
                            pointToLayer: function (data, latlng) {
                                return L.circleMarker(latlng, DEFAULT_STYLE);
                            }
                        });

                        map.addLayer(layer);
                        map.fitBounds(layer.getBounds());

                        layerId++;

                        var entry = {
                            id: layerId,
                            name: file.name || "Layer " + layerId,
                            layer: layer,
                            attribute: null,
                            categoryColors: { default: { default: DEFAULT_STYLE.color } }
                        };

                        layers.push(entry);
                        updateLayerPanel();

                    } catch (err) {
                        console.error("GeoJSON parse error:", err);
                    }

                    input.value = "";
                };

                reader.readAsText(file);
            });

            L.DomEvent.disableClickPropagation(container);

            return container;
        };
        fileControl.addTo(map);


        var panelControl = L.control({ position: 'topright' });
        panelControl.onAdd = function () {
            var div = L.DomUtil.create('div');
            div.id = "layerPanel";
            div.innerHTML = "<strong>レイヤパネル</strong>";
            var div_container = L.DomUtil.create('div');
            div_container.id = 'layerContainer';
            div.appendChild(div_container);
            L.DomEvent.disableClickPropagation(div);
            return div;
        };
        panelControl.addTo(map);


        function updateLayerPanel() {

            var panel = document.getElementById("layerContainer");
            panel.innerHTML = "";

            layers.reverse().forEach(function (entry) {

                var container = document.createElement("div");
                container.id = entry.name;
                container.dataset.id = entry.id;
                container.className = "layer-item";

                var drag = document.createElement("div");
                drag.className = "drag-handle";
                drag.innerHTML = "☰";

                // 表示チェック
                var label = document.createElement("label");
                var checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = map.hasLayer(entry.layer);

                // レイヤ名
                var title = document.createElement("strong");
                title.innerHTML = entry.name;
                label.append(checkbox, title);
                checkbox.onchange = function () {
                    if (this.checked) {
                        map.addLayer(entry.layer);
                    } else {
                        map.removeLayer(entry.layer);
                    }
                };


                // 削除ボタン
                var removeBtn = document.createElement("button");
                removeBtn.textContent = "×";
                removeBtn.className = "layer-remove-btn";
                removeBtn.onclick = function () {
                    if (!confirm(`「${entry.name}」を削除しますか？`)) {
                        return;
                    }
                    // 1. map から削除
                    map.removeLayer(entry.layer);
                    // 2. layers 配列から削除
                    layers = layers.filter(e => e.id !== entry.id);
                    // 3. パネル再構築
                    updateLayerPanel();
                };

                // 属性選択
                var select = document.createElement("select");
                select.style.width = "100%";
                var props = Object.keys(
                    entry.layer.toGeoJSON().features[0].properties
                );
                var def = document.createElement("option");
                def.value = "";
                def.text = "色分けなし";
                select.appendChild(def);
                props.forEach(function (p) {
                    var opt = document.createElement("option");
                    opt.value = p;
                    opt.text = p;
                    select.appendChild(opt);
                });
                select.onchange = function () {
                    entry.attribute = this.value;
                    var cont = document.getElementById(entry.name);
                    var leg = cont.querySelector(".legend");
                    if (leg) {
                        leg.remove();   // ← これが重要
                    }
                    var legend = applyStyle(entry);
                    cont.appendChild(legend);
                };

                container.appendChild(drag);
                container.appendChild(label);
                container.appendChild(removeBtn);
                container.appendChild(select);

                if (entry.attribute) {
                    select.value = entry.attribute;
                }
                var legend = applyStyle(entry);
                container.appendChild(legend);


                panel.appendChild(container);

            });
        }

        function applyStyle(entry) {

            var legend = document.createElement("div");
            legend.className = "legend";

            var attr = "";

            var values = [];


            if (!entry.attribute) {
                entry.layer.eachLayer(function (l) {
                    l.setStyle(DEFAULT_STYLE);
                });
                values.push("default");
                attr = "default";
            } else {
                attr = entry.attribute;
                entry.layer.eachLayer(function (l) {
                    values.push(getCategoryValue(l.feature, attr));
                });
            }

            var isNumeric = values.every(v => !isNaN(v));

            if (isNumeric) {

                var min = Math.min(...values);
                var max = Math.max(...values);

                // 0除算防止
                var range = (max - min) || 1;

                // レイヤ着色
                entry.layer.eachLayer(function (l) {

                    var v = Number(l.feature.properties[attr]);
                    var ratio = (v - min) / range;
                    var color = chroma.scale("YlOrRd")(ratio).hex();

                    l.setStyle({
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.8,
                        weight: 1
                    });
                });

                // ---- 凡例構築 ----

                legend.innerHTML = "";

                var wrapper = document.createElement("div");
                wrapper.className = "legend-gradient-wrapper";

                var maxLabel = document.createElement("div");
                maxLabel.className = "legend-max";
                maxLabel.textContent = max.toFixed(2);

                var gradientBar = document.createElement("div");
                gradientBar.className = "legend-gradient";

                var minLabel = document.createElement("div");
                minLabel.className = "legend-min";
                minLabel.textContent = min.toFixed(2);

                wrapper.appendChild(maxLabel);
                wrapper.appendChild(gradientBar);
                wrapper.appendChild(minLabel);

                legend.appendChild(wrapper);

            } else {

                legend.innerHTML = "";
                const MAX_CATEGORIES = 20;

                var cats = [...new Set(values)].sort();

                if (cats.length > MAX_CATEGORIES) {

                    console.warn("カテゴリ数が多すぎます:", cats.length);

                    // 単色にする
                    entry.layer.eachLayer(function (l) {
                        l.setStyle({
                            color: "#3388ff",
                            fillColor: "#3388ff",
                            fillOpacity: 0.6,
                            weight: 1
                        });
                    });

                    // 凡例なし、または警告表示
                    legend.innerHTML = "カテゴリ数が多すぎるため色分けできません";
                    return legend;
                }


                var colors = chroma.scale(chroma.brewer.spectral).colors(cats.length);

                if (!entry.categoryColors[attr]) {
                    entry.categoryColors[attr] = {};
                    cats.forEach(function (cat) {
                        entry.categoryColors[attr][cat] = colors[cats.indexOf(cat)];
                    });
                }

                entry.layer.eachLayer(function (l) {
                    
                    var value = "default"
                    if (attr != "default") {
                        value = getCategoryValue(l.feature, attr);
                    }

                    l.setStyle({
                        color: entry.categoryColors[attr][value],
                        fillColor: entry.categoryColors[attr][value],
                        fillOpacity: 0.8,
                        weight: 1
                    });
                });

                cats.forEach(cat => {

                    var row = document.createElement("div");
                    row.className = "legend-row";

                    var icon = document.createElement("i");
                    icon.className = "legend-color";
                    icon.style.background = entry.categoryColors[attr][cat];

                    // カラーピッカー
                    var picker = document.createElement("input");
                    picker.type = "color";
                    picker.value = entry.categoryColors[attr][cat];
                    picker.className = "legend-picker";

                    picker.oninput = function () {
                        entry.categoryColors[attr][cat] = this.value;
                        icon.style.background = this.value;
                        applyStyle(entry);
                    };

                    icon.appendChild(picker);

                    var label = document.createElement("span");
                    label.textContent = cat;

                    row.appendChild(icon);
                    row.appendChild(label);

                    legend.appendChild(row);
                });
            }
            return legend;
        }

        function updateLayerOrder() {

            const container = document.getElementById("layerContainer");
            const cards = container.children;

            var newOrder = [];

            for (let card of cards) {
                const id = card.dataset.id; // entry.idを埋め込んでおく
                const entry = layers.find(l => l.id == id);
                newOrder.push(entry);
            }
            layers = newOrder.reverse();
            updateLayerPanel();
        }

        function initLayerSortable() {

            new Sortable(document.getElementById("layerContainer"), {
                animation: 150,
                handle: ".drag-handle",
                onEnd: function () {
                    updateLayerOrder();
                }
            });

        }

        initLayerSortable();

        function getCategoryValue(feature, attr) {
            const v = feature.properties[attr];

            if (v === null || v === undefined || v === "") {
                return "(No Data)";
            }

            return String(v);
        }
    }



    window.addEventListener('load', function () {
        initMap();
    });
}(window));