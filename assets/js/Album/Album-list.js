var visitedPlaces = [
    { place: "北京", cluster: "京津冀", region: "中国华北", x: 34, y: 38 },
    { place: "天津", cluster: "京津冀", region: "中国华北", x: 61, y: 58 },
    { place: "上海", cluster: "长三角", region: "中国华东", x: 72, y: 45 },
    { place: "南京", cluster: "长三角", region: "中国华东", x: 36, y: 34 },
    { place: "杭州", cluster: "长三角", region: "中国华东", x: 52, y: 64 },
    { place: "舟山", cluster: "长三角", region: "中国华东", x: 78, y: 68 },
    { place: "福州", cluster: "福建", region: "中国东南", x: 42, y: 38 },
    { place: "厦门", cluster: "福建", region: "中国东南", x: 62, y: 64 },
    { place: "广州", cluster: "珠三角", region: "中国华南", x: 28, y: 36 },
    { place: "深圳", cluster: "珠三角", region: "中国华南", x: 54, y: 54 },
    { place: "珠海", cluster: "珠三角", region: "中国华南", x: 34, y: 72 },
    { place: "香港", cluster: "珠三角", region: "中国香港", x: 74, y: 56 },
    { place: "澳门", cluster: "珠三角", region: "中国澳门", x: 58, y: 78 },
    { place: "曼谷", cluster: "泰国", region: "泰国", x: 43, y: 40 },
    { place: "普吉岛", cluster: "泰国", region: "泰国", x: 58, y: 70 }
];

function findPlace(placeName) {
    return visitedPlaces.find(function (item) {
        return item.place === placeName;
    });
}

function getClusterPlaces(clusterName) {
    return visitedPlaces.filter(function (item) {
        return item.cluster === clusterName;
    });
}

function getClusterMarker(clusterName) {
    return Array.from(document.querySelectorAll(".map-marker")).find(function (marker) {
        return marker.dataset.cluster === clusterName;
    });
}

function setActivePlace(placeName) {
    var place = findPlace(placeName);
    var marker = place ? getClusterMarker(place.cluster) : getClusterMarker(placeName);

    if (!marker) {
        return;
    }

    var activeCluster = marker.dataset.cluster;
    var activePlaceName = place ? place.place : marker.dataset.place;
    var region = place ? place.region : marker.dataset.region;
    var status = place ? "照片页待建设" : marker.dataset.status;

    document.querySelectorAll(".map-marker").forEach(function (item) {
        item.classList.toggle("is-active", item.dataset.cluster === activeCluster);
    });

    document.querySelectorAll(".visited-tags a").forEach(function (tag) {
        tag.classList.toggle("is-active", tag.dataset.place === activePlaceName);
    });

    document.getElementById("selectedPlace").textContent = activePlaceName;
    document.getElementById("selectedRegion").textContent = region;
    document.getElementById("selectedStatus").textContent = status;
    showLoupe(activeCluster, activePlaceName);
}

function showLoupe(clusterName, activePlaceName) {
    var loupe = document.getElementById("mapLoupe");
    var loupeTitle = document.getElementById("loupeTitle");
    var loupeGrid = document.getElementById("loupeGrid");
    var clusterPlaces = getClusterPlaces(clusterName);

    loupeTitle.textContent = clusterName + "局部";
    loupeGrid.innerHTML = "";

    clusterPlaces.forEach(function (place) {
        var button = document.createElement("button");

        button.className = "loupe-point";
        button.type = "button";
        button.textContent = place.place;
        button.dataset.place = place.place;
        button.style.setProperty("--lx", place.x + "%");
        button.style.setProperty("--ly", place.y + "%");
        button.classList.toggle("is-active", place.place === activePlaceName);
        loupeGrid.appendChild(button);
    });

    loupe.classList.add("is-visible");
}

function hideLoupe() {
    document.getElementById("mapLoupe").classList.remove("is-visible");
}

document.addEventListener("DOMContentLoaded", function () {
    var markers = document.querySelectorAll(".map-marker");
    var tags = document.querySelectorAll(".visited-tags a");
    var loupeGrid = document.getElementById("loupeGrid");

    markers.forEach(function (marker) {
        var activateCluster = function (event) {
            event.preventDefault();
            setActivePlace(marker.dataset.cluster);
        };

        marker.addEventListener("click", activateCluster);
        marker.addEventListener("mouseenter", activateCluster);
        marker.addEventListener("focus", activateCluster);
    });

    tags.forEach(function (tag) {
        tag.addEventListener("click", function (event) {
            event.preventDefault();
            setActivePlace(tag.dataset.place);
        });
    });

    loupeGrid.addEventListener("click", function (event) {
        var button = event.target.closest(".loupe-point");

        if (!button) {
            return;
        }

        setActivePlace(button.dataset.place);
    });

    document.querySelector(".map-stage").addEventListener("mouseleave", hideLoupe);
    setActivePlace("京津冀");
});
