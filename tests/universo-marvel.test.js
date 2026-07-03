const assert = require("node:assert/strict");
const { parseDirectory, parseIndexLinks, parseUniversoMarvelProduct } = require("../src/universo-marvel");

const directory = parseDirectory(`
  <option value="sppan_v2.html">Asombroso Spiderman vol.1</option>
  <option value="esp/nsspidmenp.html">Nosotros somos Spidermen</option>
`);
assert.equal(directory.length, 2);
assert.equal(directory[0].priority, 10);
assert.equal(directory.some((item) => item.isProduct), true);

const links = parseIndexLinks(`
  <a href="sppan_v2_100.html">1-100</a>
  <a href="esp/sppan201.html">1</a>
  <a href="panini.html">Volver</a>
`, "https://fichas.universomarvel.com/sppan_v2.html", "sppan_v2", 10);
assert.equal(links.products.length, 1);
assert.equal(links.nestedIndexes.length, 1);

const product = parseUniversoMarvelProduct(`
  <title>SPIDER-MAN vol.1 nº 13 - Panini</title>
  <!-- Portada --><img src="portadas/spidmp113.jpg">
  <small>CB:977000550200700013</small>
  <a href="../fechases/2017e_junio.html">Junio 2017</a><b>Grapa</b>
  <b>48 Páginas + cubiertas</b>
  <!-- Contenido USA --><table><li><a>Spider-Man Vol.2 #13</a></li></td></table>
  <!-- Contenido USA --><table><li><a>Spider-Gwen Vol.2 #17</a></li></td></table>
  </body>
`, "https://fichas.universomarvel.com/esp/spidmp113.html");
assert.equal(product.title, "SPIDER-MAN vol.1 nº 13");
assert.equal(product.pages, 48);
assert.equal(product.publicationDate, "2017-06-01");
assert.equal(product.containsRaw, "Spider-Man Vol.2 #13; Spider-Gwen Vol.2 #17");
assert.match(product.coverImageUrl, /portadas\/spidmp113\.jpg/);

const realCoverMarkup = parseUniversoMarvelProduct(`
  <title>Marvel Gold: Spiderman - Panini</title>
  <!-- Portada y Datos-->
  <img src="../imagen/logopanini.jpg">
  <a onClick="MM_openBrWindow('portadas/marvelgoldsp.jpg','','resizable=no')">
    <img width=150 src="portadas/marvelgoldsp.jpg">
  </a>
`, "https://fichas.universomarvel.com/esp/marvelgoldsp.html");
assert.equal(realCoverMarkup.coverImageUrl, "https://fichas.universomarvel.com/esp/portadas/marvelgoldsp.jpg");

console.log("ok - parsea directorio, índices y fichas de Universo Marvel");
