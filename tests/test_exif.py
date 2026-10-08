import io

from PIL import Image
import piexif

from backend.exif import extract_exif


def make_jpeg_with_exif():
    img = Image.new("RGB", (40, 30), (128, 128, 128))
    exif_dict = {
        "0th": {
            piexif.ImageIFD.Make: b"Canon",
            piexif.ImageIFD.Model: b"Canon EOS Rebel SL3",
        },
        "Exif": {
            piexif.ExifIFD.ISOSpeedRatings: 800,
            piexif.ExifIFD.ExposureTime: (1, 250),
            piexif.ExifIFD.FNumber: (28, 10),
            piexif.ExifIFD.FocalLength: (50, 1),
        },
    }
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=piexif.dump(exif_dict))
    buf.seek(0)
    return Image.open(buf)


def test_extract_exif_fields():
    exif = extract_exif(make_jpeg_with_exif())
    assert exif["has_exif"] is True
    assert exif["camera_make"] == "Canon"
    assert exif["iso"] == 800
    assert exif["shutter_speed"] == "1/250"
    assert exif["aperture"] == "f/2.8"
    assert exif["focal_length"] == "50mm"


def test_extract_exif_without_metadata():
    img = Image.new("RGB", (10, 10), (0, 0, 0))
    exif = extract_exif(img)
    assert exif["has_exif"] is False
    assert exif["iso"] is None
