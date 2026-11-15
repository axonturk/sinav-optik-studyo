"""Sentetik (uydurma kurum) kalite formu .docx örnekleri üretir — gerçek kişi/kurum verisi içermez.
Kullanım: python test-ornekleri/uret_kurum_form_ornek.py test-ornekleri"""
import zipfile, base64, struct, zlib, sys

CIKTI = sys.argv[1]

def png_kare(renk=(200, 30, 40), boy=24):
    satirlar = b''.join(b'\x00' + bytes(renk) * boy for _ in range(boy))
    def parca(t, v): return struct.pack('>I', len(v)) + t + v + struct.pack('>I', zlib.crc32(t + v) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + parca(b'IHDR', struct.pack('>IIBBBBB', boy, boy, 8, 2, 0, 0, 0)) + parca(b'IDAT', zlib.compress(satirlar)) + parca(b'IEND', b'')

NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
      'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"')

def r(t, b=False, sz=None):
    rpr = ('<w:b/>' if b else '') + (f'<w:sz w:val="{sz}"/>' if sz else '')
    return f'<w:r>{"<w:rPr>"+rpr+"</w:rPr>" if rpr else ""}<w:t xml:space="preserve">{t}</w:t></w:r>'

def p(icerik, jc=None):
    return f'<w:p>{f"<w:pPr><w:jc w:val=\"{jc}\"/></w:pPr>" if jc else ""}{icerik}</w:p>'

def alan(ins):
    return (f'<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> {ins} </w:instrText></w:r>'
            f'<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>')

def resim(rid, cx=900000, cy=900000):
    return (f'<w:r><w:drawing><wp:inline><wp:extent cx="{cx}" cy="{cy}"/><a:graphic><a:graphicData>'
            f'<pic:pic><pic:blipFill><a:blip r:embed="{rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')

def filigran(rid):
    return (f'<w:r><w:pict><v:shape id="WordPictureWatermark1" style="position:absolute;width:400pt;height:400pt">'
            f'<v:imagedata r:id="{rid}" o:title=""/></v:shape></w:pict></w:r>')

def tc(icerik, w, span=None, vm=None, kenar=None, shd=None):
    pr = f'<w:tcW w:w="{w}" w:type="dxa"/>'
    if span: pr += f'<w:gridSpan w:val="{span}"/>'
    if vm == 'bas': pr += '<w:vMerge w:val="restart"/>'
    elif vm == 'devam': pr += '<w:vMerge/>'
    if kenar: pr += f'<w:tcBorders>{kenar}</w:tcBorders>'
    if shd: pr += f'<w:shd w:val="clear" w:color="auto" w:fill="{shd}"/>'
    return f'<w:tc><w:tcPr>{pr}</w:tcPr>{icerik}</w:tc>'

TUM_KENAR = ''.join(f'<w:{y} w:val="single" w:sz="4" w:space="0" w:color="000000"/>' for y in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'])

def docx(ad, header_xml, footer_xml, gorseller):
    govde = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>'
             f'{p(r("Form gövdesi (uygulama kendi içeriğini basar)"))}'
             '<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/>'
             + ('<w:footerReference w:type="default" r:id="rIdF"/>' if footer_xml else '') +
             '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
             '</w:body></w:document>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
            + ('<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' if footer_xml else '') +
            '</Relationships>')
    hrels = ('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
             + ''.join(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{dosya}"/>' for rid, dosya, _ in gorseller)
             + '</Relationships>')
    ct = ('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
          '<Default Extension="png" ContentType="image/png"/></Types>')
    with zipfile.ZipFile(f'{CIKTI}/{ad}', 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', ct)
        z.writestr('word/document.xml', govde)
        z.writestr('word/_rels/document.xml.rels', rels)
        z.writestr('word/header1.xml', f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {NS}>{header_xml}</w:hdr>')
        z.writestr('word/_rels/header1.xml.rels', hrels)
        if footer_xml:
            z.writestr('word/footer1.xml', f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {NS}>{footer_xml}</w:ftr>')
        for _, dosya, veri in gorseller:
            z.writestr(f'word/media/{dosya}', veri)

# 1) Tablolu başlık: logo (dikey birleşik) + 2 satırlık başlık (yatay birleşik) + PAGE/NUMPAGES alanı + filigran
kolonlar = [1800, 4600, 1700, 1500]
grid = '<w:tblGrid>' + ''.join(f'<w:gridCol w:w="{k}"/>' for k in kolonlar) + '</w:tblGrid>'
tblpr = f'<w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders>{TUM_KENAR}</w:tblBorders></w:tblPr>'
satir = lambda h, ic: f'<w:tr><w:trPr><w:trHeight w:val="{h}"/></w:trPr>{ic}</w:tr>'
ust1 = (f'<w:tbl>{tblpr}{grid}'
        + satir(340, tc(p(resim('rIdLogo'), 'center'), 1800, vm='bas') + tc(p(r('T.C. ÖRNEK ÜNİVERSİTESİ', True, 24), 'center'), 4600, vm='bas')
                + tc(p(r('Doküman No')), 1700) + tc(p(r('ÖRN-FR-0071')), 1500))
        + satir(340, tc(p(''), 1800, vm='devam') + tc(p(''), 4600, vm='devam') + tc(p(r('Yayın Tarihi')), 1700) + tc(p(r('12.03.2024')), 1500))
        + satir(340, tc(p(''), 1800, vm='devam') + tc(p(r('SINAV EVRAKI TESLİM FORMU', True, 22), 'center'), 4600, vm='bas') + tc(p(r('Revizyon No')), 1700) + tc(p(r('02')), 1500))
        + satir(340, tc(p(''), 1800, vm='devam') + tc(p(''), 4600, vm='devam') + tc(p(r('Sayfa')), 1700) + tc(p(alan('PAGE') + r(' / ') + alan('NUMPAGES')), 1500))
        + '</w:tbl>' + p(filigran('rIdFiligran')))
alt1 = (f'<w:tbl><w:tblPr><w:tblBorders>{TUM_KENAR}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4800"/><w:gridCol w:w="4800"/></w:tblGrid>'
        + satir(500, tc(p(r('Hazırlayan', True), 'center') + p(r('Bölüm Kalite Temsilcisi'), 'center'), 4800, shd='D9D9D9')
                + tc(p(r('Onaylayan', True), 'center') + p(r('Müdür &amp; Kurul &lt;Onay&gt;'), 'center'), 4800, shd='D9D9D9'))
        + '</w:tbl>')
docx('kurum-formu-ornek-tablolu.docx', ust1, alt1, [('rIdLogo', 'logo.png', png_kare()), ('rIdFiligran', 'filigran.png', png_kare((230, 230, 230), 40))])

# 2) Tablosuz başlık: ortalı paragraflar + sağda "Sayfa No: PAGE"; kenarlıksız (nil) tek satırlık tablo; alt bilgi yok
nil = ''.join(f'<w:{y} w:val="nil"/>' for y in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'])
ust2 = (p(resim('rIdLogo', 600000, 600000), 'center') + p(r('ÖRNEK BELEDİYESİ MESLEK YÜKSEKOKULU', True, 26), 'center')
        + p(r('Form Kodu: MYO-F-12 · Rev.01', False, 16), 'right')
        + f'<w:tbl><w:tblPr><w:tblBorders>{nil}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="7000"/><w:gridCol w:w="2600"/></w:tblGrid>'
        + satir(0, tc(p(r('YAZILI SINAV YOKLAMA LİSTESİ', True)), 7000) + tc(p(r('Sayfa No: ') + f'<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>', 'right'), 2600))
        + '</w:tbl>')
docx('kurum-formu-ornek-paragraf.docx', ust2, None, [('rIdLogo', 'logo.png', png_kare((20, 60, 160)))])
print('ok')
