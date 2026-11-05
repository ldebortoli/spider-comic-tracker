# Revision de las 11 correspondencias pendientes de W45

Fecha: 2026-11-05. Alcance congelado: las once entradas `pending_match` del
recibo de recuperacion `source-review-017`; no se incluyeron otros pendientes.

Resultado: **11 fichas revisadas, 48 numeros originales contrastados,
0 coincidencias en los 11.498 issues del catalogo local y 0 vinculos creados**.
Las once fichas mantienen su estado pendiente. Sus descargas estan completas;
el impedimento actual es la ausencia de los originales correspondientes en el
catalogo, no una descarga fallida.

| Edicion espanola | Originales declarados por Panini | Resultado |
| --- | --- | --- |
| La Espada Salvaje de Conan 10 | The Savage Sword of Conan #10, edicion de Titan Comics | No hay original correspondiente en el catalogo; no confundir con la serie antigua de Marvel. |
| Biblioteca Conan. La espada salvaje de Conan 22 | The Savage Sword of Conan #68–70 | Ninguno de esos tres numeros esta cargado. |
| Marvel Essentials. Iron Man: la guerra de las armaduras | Iron Man #225–232 | Ninguno de esos ocho numeros esta cargado, tampoco bajo Invincible Iron Man. |
| La era de revelacion: el ultimo Lobezno 1 | The Last Wolverine #1 y Laura Kinney: Sabretooth #1 | Ninguno esta cargado. La serie Wolverine disponible no es un sustituto de The Last Wolverine. |
| Patrulla-X 12 | X-Men #14–15, serie de Jed MacKay y Ryan Stegman de 2024 | No estan cargados, ni aparecen esos numeros bajo otro volumen de X-Men. |
| Marvel Premiere. Extrano 1 | Strange #1–5, serie de Jed MacKay y Marcelo Ferreira de 2022 | No estan cargados. Doctor Strange y Strange Tales son series diferentes. |
| Marvel Essentials. Aniquilacion: Conquista | Annihilation: Conquest #1–6 | No estan cargados. Annihilation 2099 y What If? Annihilation no son equivalentes. |
| Biblioteca Conan. Conan el Barbaro 16 | Conan the Barbarian #89–95 | Ninguno de esos siete numeros esta cargado. |
| Biblioteca Marvel 92. El Poderoso Thor 11 | The Mighty Thor #149–155 | No estan cargados bajo Thor, Mighty Thor ni The Mighty Thor. El Thor #148 presente queda fuera del contenido declarado. |
| Biblioteca Marvel 91. El Increible Hulk 6 | The Incredible Hulk #102–107 | No estan cargados bajo Incredible Hulk, The Incredible Hulk ni Hulk. |
| Inferno 1 de 4 | Inferno #1 de Jonathan Hickman y Valerio Schiti, 2021 | No esta cargado. Marvel Super Hero Adventures: Inferno #1 es otra obra. |

## Fuentes y limites

El contenido, ISBN/editorial y autores se cotejaron con las fichas originales
de Panini conservadas durante la recuperacion anterior, sin volver a descargar
el catalogo completo. Se verificaron las siguientes identidades en fuentes
editoriales para resolver las principales ambiguedades:

- [Iron Man: Armor Wars, Marvel](https://www.marvel.com/comics/collection/70412/iron_man_armor_wars_tpb_new_printing_2018_1): corresponde a Iron Man de 1968, #225–232.
- [X-Men #14, Marvel](https://www.marvel.com/comics/issue/115453/x-men_2024_14): serie de 2024, autores Jed MacKay y Ryan Stegman.
- [Strange, Marvel](https://www.marvel.com/comics/series/34274/strange_%282022_-_2023%29): serie de 2022–2023, diferente de Doctor Strange y Strange Tales.
- [The Last Wolverine, Marvel](https://www.marvel.com/comics/series/44579/the_last_wolverine_2025_present) y [Laura Kinney: Sabretooth #1, Marvel](https://www.marvel.com/comics/issue/132852/laura_kinney_sabretooth_2025_1_variant/variant): dos series de 2025 diferentes de Wolverine.
- [Annihilation: Conquest #1, Marvel](https://www.marvel.com/comics/issue/17271/read): serie de 2007 de Dan Abnett, Andy Lanning y Tom Raney.
- [Inferno, Marvel](https://www.marvel.com/comics/series/32954/inferno_2021_-_2022?creatorId=10144&variants=true): miniserie de 2021–2022 de Hickman.
- [Novedades de marzo, Panini](https://www.panini.es/media/paniniFiles/marzobaja.pdf): contenido, autores e ISBN de La Espada Salvaje de Conan 10. Su ficha de producto identifica a Titan Comics como editorial original.

La ausencia del catalogo local no demuestra por si sola que no exista una
aparicion de un personaje seguido. Esta revision no certifica tal ausencia ni
amplia el inventario USA con numeros ajenos al alcance aprobado. Para vincular
mas adelante hace falta que exista el original correcto en el catalogo y se
confirme su pertenencia al alcance seguido.

## Validacion

- SQLite se abrio con URI `mode=ro`, `PRAGMA query_only=ON` y transaccion de lectura.
- Se comprobo la identidad exacta de las once entradas contra el inventario congelado.
- Se buscaron serie y numero en todos los volumenes disponibles, variantes de nombre y titulos de pagina como comprobacion secundaria de campos mal parseados.
- Recibo local reproducible: `data/correspondence-review-20261105/audit-receipt.json`; 48 originales, cero candidatos, `total_changes=0`.
- No hubo modificaciones de datos, programa, version, interfaz, configuracion, procesos, scheduler, Telegram o recibos de apagado. Version conservada: 0.1.7.
